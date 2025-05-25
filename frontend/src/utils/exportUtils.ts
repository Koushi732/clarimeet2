import { Session, SessionDetail, Summary, Transcription } from '../types';
import { format } from 'date-fns';
import { saveAs } from 'file-saver';

interface SessionWithNotes extends SessionDetail {
  notes?: string;
}

// Convert session data to Markdown format
export const sessionToMarkdown = (session: SessionWithNotes): string => {
  const createdDate = new Date(session.createdAt);
  const formattedDate = format(createdDate, 'MMMM do, yyyy h:mm a');
  
  let markdown = `# ${session.title}\n\n`;
  
  // Add metadata
  markdown += `- **Date:** ${formattedDate}\n`;
  markdown += `- **Session ID:** ${session.id}\n`;
  if (session.description) {
    markdown += `- **Description:** ${session.description}\n`;
  }
  markdown += '\n---\n\n';
  
  // Add summary section if available
  if (session.summaries && session.summaries.length > 0) {
    markdown += '## Summary\n\n';
    
    // Find the most recent overall summary
    const overallSummary = session.summaries
      .filter(s => s.summaryType === 'overall')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    
    if (overallSummary) {
      markdown += `${overallSummary.text}\n\n`;
    } else if (session.summaries.length > 0) {
      // Use the most recent summary of any type if no overall summary exists
      const latestSummary = session.summaries
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
      markdown += `${latestSummary.text}\n\n`;
    }
  }
  
  // Add key points if available (usually from BART summarizer)
  const keyPointsSummary = session.summaries?.find(s => s.summaryType === 'key_points');
  if (keyPointsSummary) {
    markdown += '## Key Points\n\n';
    
    // Try to split by newlines or bullet points if the content has them
    if (keyPointsSummary.text.includes('\n')) {
      const points = keyPointsSummary.text.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.trim().startsWith('-') ? line : `- ${line}`);
      
      markdown += points.join('\n');
    } else {
      markdown += keyPointsSummary.text;
    }
    
    markdown += '\n\n';
  }
  
  // Add action items if available
  const actionItemsSummary = session.summaries?.find(s => s.summaryType === 'action_items');
  if (actionItemsSummary) {
    markdown += '## Action Items\n\n';
    
    // Try to split by newlines or bullet points if the content has them
    if (actionItemsSummary.text.includes('\n')) {
      const actions = actionItemsSummary.text.split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => line.trim().startsWith('-') ? line : `- ${line}`);
      
      markdown += actions.join('\n');
    } else {
      markdown += actionItemsSummary.text;
    }
    
    markdown += '\n\n';
  }
  
  // Add full transcript if available
  if (session.transcriptions && session.transcriptions.length > 0) {
    markdown += '## Full Transcript\n\n';
    
    // Sort transcriptions by time
    const sortedTranscripts = [...session.transcriptions]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    for (const transcript of sortedTranscripts) {
      const timestamp = format(new Date(transcript.timestamp), 'h:mm:ss a');
      markdown += `**[${timestamp}]** ${transcript.text}\n\n`;
    }
  }
  
  // Add user notes if available
  if (session.notes) {
    markdown += '## Notes\n\n';
    markdown += session.notes;
    markdown += '\n\n';
  }
  
  return markdown;
};

// Export session as Markdown file
export const exportAsMarkdown = (session: SessionDetail): void => {
  const markdown = sessionToMarkdown(session as SessionWithNotes);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  saveAs(blob, `${session.title.replace(/\s+/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.md`);
};

// Export session as PDF using browser's print functionality
export const exportAsPDF = async (session: SessionDetail): Promise<void> => {
  const markdown = sessionToMarkdown(session as SessionWithNotes);
  
  // Create a hidden iframe to render the content for printing
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  
  // Convert markdown to styled HTML
  const styledHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${session.title}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          margin: 0;
          padding: 20px;
          color: #333;
        }
        h1 { font-size: 24px; margin-bottom: 16px; }
        h2 { font-size: 20px; margin-top: 24px; margin-bottom: 12px; }
        p { margin-bottom: 16px; }
        ul { margin-bottom: 16px; }
        li { margin-bottom: 8px; }
        hr { margin: 20px 0; border: 0; border-top: 1px solid #ddd; }
        .meta { color: #666; font-size: 14px; }
        .transcript { margin-top: 8px; }
        .timestamp { font-weight: bold; color: #555; }
        @media print {
          body { font-size: 12px; }
          h1 { font-size: 18px; }
          h2 { font-size: 16px; }
          .pagebreak { page-break-before: always; }
        }
      </style>
    </head>
    <body>
      <h1>${session.title}</h1>
      <div class="meta">
        <p>
          Date: ${format(new Date(session.createdAt), 'MMMM do, yyyy h:mm a')}<br>
          ${session.description ? `Description: ${session.description}` : ''}
        </p>
      </div>
      <hr>
      ${markdownToHtml(markdown)}
    </body>
    </html>
  `;
  
  // Write the HTML content to the iframe
  iframe.contentWindow?.document.open();
  iframe.contentWindow?.document.write(styledHtml);
  iframe.contentWindow?.document.close();
  
  // Wait for iframe to load completely
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Trigger print
  iframe.contentWindow?.print();
  
  // Remove the iframe after printing
  setTimeout(() => {
    document.body.removeChild(iframe);
  }, 2000);
};

// Helper function to convert markdown to simple HTML
const markdownToHtml = (markdown: string): string => {
  let html = markdown
    // Headers
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    
    // Italic
    .replace(/_(.+?)_/g, '<em>$1</em>')
    
    // Lists
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    
    // Horizontal rule
    .replace(/^---$/gm, '<hr>')
    
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    
    // Preserve line breaks within paragraphs
    .replace(/\n/g, '<br>');
  
  // Wrap lists
  html = html.replace(/(<li>.+<\/li>)\s*(<li>.+<\/li>)/g, '<ul>$1$2</ul>');
  
  // Wrap the content in paragraph tags
  html = `<p>${html}</p>`;
  
  // Fix nested paragraphs
  html = html.replace(/<p><h(\d)>/g, '<h$1>');
  html = html.replace(/<\/h(\d)><\/p>/g, '</h$1>');
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p><ul>/g, '<ul>');
  html = html.replace(/<\/ul><\/p>/g, '</ul>');
  
  return html;
};
