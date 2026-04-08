import { NextRequest, NextResponse } from 'next/server';
import { recordApiUsage } from '@/lib/api-usage';
import Replicate from 'replicate';

export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();

    if (!video) {
      return NextResponse.json({ error: 'Missing video input' }, { status: 400 });
    }

    console.log(`--- VIDEO MATTE START --- Engine: RVM`);

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN is not configured' }, { status: 500 });
    }

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN || "",
    });

    // Inference: Robust Video Matting (arielreplicate/robust_video_matting)
    // Optimized for temporal consistency
    const output: any = await replicate.run(
      "arielreplicate/robust_video_matting:df03798935c106575239a9cba2e6467fac75586617a264a9fb120a1608674515",
      {
        input: {
          video: video,
          output_type: "video_rgba" 
        }
      }
    );

    console.log('Video RVM Output:', output);

    // RVM typically returns a URL to the processed video
    const result_url = Array.isArray(output) ? output[0] : output;

    await recordApiUsage({
      provider: "replicate",
      serviceId: "replicate-vmatte",
      route: "/api/spaces/video-matte",
      model: "robust_video_matting",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0.05,
      note: "Video matte (estimado)",
    });

    return NextResponse.json({
      rgba_url: result_url,
      mask_url: result_url, // RVM can separate these if configured, but for now we return the RGBA
      success: true
    });

  } catch (error: any) {
    console.error('[Video Matte] CRITICAL ERROR:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
