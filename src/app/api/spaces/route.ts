import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { deleteFromS3 } from '@/lib/s3-utils';
import { collectS3KeysFromProjectSpaces } from '@/lib/s3-media-hydrate';
import { runSpacesDbExclusive } from '@/lib/spaces-db-queue';

const DB_PATH = path.join(process.cwd(), 'data', 'spaces-db.json');

// Helper to ensure directory exists
const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readDB() {
  if (!fs.existsSync(DB_PATH)) return [];
  const data = fs.readFileSync(DB_PATH, 'utf8');
  return JSON.parse(data);
}

function writeDB(data: any) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

export async function GET() {
  try {
    const projects = readDB();
    return NextResponse.json(projects);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read projects' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    return await runSpacesDbExclusive(async () => {
      const { id, name, rootSpaceId, spaces, metadata } = body;
      const projects = readDB();

      if (id) {
        const index = projects.findIndex((p: any) => p.id === id);
        if (index !== -1) {
          projects[index] = {
            ...projects[index],
            name: name || projects[index].name,
            rootSpaceId: rootSpaceId || projects[index].rootSpaceId,
            spaces: spaces || projects[index].spaces,
            metadata: metadata || projects[index].metadata,
            updatedAt: new Date().toISOString(),
          };
        } else {
          return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
      } else {
        const projectId = uuidv4();
        const initialSpaceId = uuidv4();
        /** Cliente usa `root`; proyectos vacíos sin body pueden usar un UUID de espacio por defecto. */
        const resolvedRoot =
          rootSpaceId != null && rootSpaceId !== ""
            ? rootSpaceId
            : spaces && typeof spaces === "object" && spaces !== null && "root" in spaces
              ? "root"
              : initialSpaceId;
        const newProject = {
          id: projectId,
          name: name || `New Project ${projects.length + 1}`,
          rootSpaceId: resolvedRoot,
          spaces: spaces || {
            [initialSpaceId]: {
              id: initialSpaceId,
              name: "Main Space",
              nodes: [],
              edges: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
          metadata: metadata ?? {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        projects.push(newProject);
      }

      writeDB(projects);
      return NextResponse.json(projects);
    });
  } catch (error) {
    console.error('Save error:', error);
    return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    return await runSpacesDbExclusive(async () => {
      const projects = readDB();
      const projectToDelete = projects.find((p: any) => p.id === id);

      if (projectToDelete) {
        console.log(`[Cleanup] Deleting project "${projectToDelete.name}"...`);

        const s3Keys = collectS3KeysFromProjectSpaces(
          (projectToDelete.spaces || {}) as Record<string, unknown>,
        );

        if (s3Keys.length > 0) {
          console.log(`[Cleanup] Found ${s3Keys.length} assets across all spaces to remove from S3.`);
          for (const key of s3Keys) {
            try {
              await deleteFromS3(key);
              console.log(`[Cleanup] Successfully removed: ${key}`);
            } catch (err) {
              console.error(`[Cleanup] Failed to remove ${key}:`, err);
            }
          }
        }
      }

      const filtered = projects.filter((p: any) => p.id !== id);
      writeDB(filtered);
      return NextResponse.json(filtered);
    });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
