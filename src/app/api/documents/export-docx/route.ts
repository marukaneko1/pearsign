/**
 * Document Export API - DOCX Format
 *
 * Converts document content to Word DOCX format
 */

import { NextRequest, NextResponse } from "next/server";
import { textToDocx } from "@/lib/text-to-docx";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { content, title, author } = body;

    if (!content || !title) {
      return NextResponse.json(
        { error: 'Missing content or title' },
        { status: 400 }
      );
    }

    // Generate the DOCX
    const docxBytes = await textToDocx(content, {
      title,
      author: author || 'PearSign',
      createdAt: new Date(),
    });

    // Return the DOCX as a download
    return new NextResponse(docxBytes, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`,
      },
    });
  } catch (error) {
    console.error('[Export DOCX] Error:', error);
    return NextResponse.json(
      { error: 'Failed to export document' },
      { status: 500 }
    );
  }
}
