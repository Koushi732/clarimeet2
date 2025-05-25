#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Export Service for Clariimeet

Provides functionality to export session data (transcriptions and summaries)
to various formats including Markdown and PDF.
"""

import os
import time
import logging
import json
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Any, Union
from datetime import datetime

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Try to import PDF generation libraries
try:
    from reportlab.lib.pagesizes import letter
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.platypus import Image as RLImage
    PDF_EXPORT_AVAILABLE = True
except ImportError:
    PDF_EXPORT_AVAILABLE = False
    logger.warning("ReportLab not available, PDF export will be disabled")

# Helper function to format timestamps as HH:MM:SS
def format_timestamp(seconds: float) -> str:
    """
    Format a timestamp in seconds as HH:MM:SS
    
    Args:
        seconds: Time in seconds
        
    Returns:
        Formatted time string
    """
    minutes, seconds = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"

# Function to generate a Markdown export
def export_to_markdown(session_data: Dict[str, Any], include_transcription: bool = True,
                      include_summary: bool = True) -> str:
    """
    Generate a Markdown export of a session
    
    Args:
        session_data: Dictionary containing session information
        include_transcription: Whether to include the transcription
        include_summary: Whether to include the summary
        
    Returns:
        Markdown formatted string
    """
    try:
        md_lines = []
        
        # Session header
        md_lines.append(f"# {session_data['title']}\n")
        
        # Session metadata
        if 'description' in session_data and session_data['description']:
            md_lines.append(f"_{session_data['description']}_\n")
            
        created_at = session_data.get('created_at')
        if isinstance(created_at, str):
            md_lines.append(f"**Date:** {created_at}\n")
        elif isinstance(created_at, (int, float)):
            dt = datetime.fromtimestamp(created_at)
            md_lines.append(f"**Date:** {dt.strftime('%Y-%m-%d %H:%M:%S')}\n")
            
        duration = session_data.get('duration', 0)
        if duration:
            md_lines.append(f"**Duration:** {format_timestamp(duration)}\n")
            
        # Add summaries
        if include_summary and 'summaries' in session_data and session_data['summaries']:
            md_lines.append("## Summary\n")
            
            # Group summaries by type
            summary_types = {}
            for summary in session_data['summaries']:
                summary_type = summary.get('summary_type', 'overall')
                if summary_type not in summary_types:
                    summary_types[summary_type] = []
                summary_types[summary_type].append(summary)
            
            # Add each summary type
            for summary_type, summaries in summary_types.items():
                md_lines.append(f"### {summary_type.capitalize()}\n")
                
                for summary in summaries:
                    # Add segment time range if available
                    if 'segment_start' in summary and 'segment_end' in summary:
                        start_time = format_timestamp(summary['segment_start'])
                        end_time = format_timestamp(summary['segment_end'])
                        md_lines.append(f"**{start_time} - {end_time}**\n")
                    
                    # Add summary text
                    md_lines.append(f"{summary['text']}\n\n")
        
        # Add transcription
        if include_transcription and 'transcriptions' in session_data and session_data['transcriptions']:
            md_lines.append("## Transcript\n")
            
            # Sort transcriptions by timestamp
            transcriptions = sorted(session_data['transcriptions'], key=lambda x: x.get('timestamp', 0))
            
            for transcription in transcriptions:
                # Format timestamp
                timestamp = transcription.get('timestamp', 0)
                formatted_time = format_timestamp(timestamp)
                
                # Add speaker if available
                speaker = ""
                if 'speaker' in transcription and transcription['speaker']:
                    speaker = f"**{transcription['speaker']}:** "
                
                # Add transcription text
                md_lines.append(f"[{formatted_time}] {speaker}{transcription['text']}\n\n")
        
        # Join all lines
        return "\n".join(md_lines)
    
    except Exception as e:
        logger.error(f"Error generating Markdown export: {e}")
        return f"# Export Error\n\nAn error occurred while generating the Markdown export: {str(e)}"

# Function to generate a PDF export
def export_to_pdf(session_data: Dict[str, Any], output_path: str, include_transcription: bool = True,
                 include_summary: bool = True, logo_path: Optional[str] = None) -> bool:
    """
    Generate a PDF export of a session
    
    Args:
        session_data: Dictionary containing session information
        output_path: Path to save the PDF file
        include_transcription: Whether to include the transcription
        include_summary: Whether to include the summary
        logo_path: Optional path to a logo image to include in the PDF
        
    Returns:
        True if successful, False otherwise
    """
    if not PDF_EXPORT_AVAILABLE:
        logger.error("PDF export is not available (ReportLab not installed)")
        return False
    
    try:
        # Create PDF document
        doc = SimpleDocTemplate(output_path, pagesize=letter)
        styles = getSampleStyleSheet()
        
        # Custom styles
        styles.add(ParagraphStyle(
            name='Title',
            parent=styles['Title'],
            fontSize=16,
            spaceAfter=12
        ))
        styles.add(ParagraphStyle(
            name='Heading2',
            parent=styles['Heading2'],
            fontSize=14,
            spaceAfter=10,
            spaceBefore=10
        ))
        styles.add(ParagraphStyle(
            name='Heading3',
            parent=styles['Heading3'],
            fontSize=12,
            spaceAfter=8,
            spaceBefore=8
        ))
        styles.add(ParagraphStyle(
            name='Normal',
            parent=styles['Normal'],
            fontSize=10,
            spaceAfter=6
        ))
        styles.add(ParagraphStyle(
            name='Timestamp',
            parent=styles['Normal'],
            fontSize=9,
            textColor=colors.darkgrey
        ))
        styles.add(ParagraphStyle(
            name='Speaker',
            parent=styles['Normal'],
            fontSize=10,
            fontName='Helvetica-Bold'
        ))
        
        # Build content
        content = []
        
        # Add logo if provided
        if logo_path and os.path.exists(logo_path):
            logo = RLImage(logo_path, width=100, height=100)
            content.append(logo)
            content.append(Spacer(1, 12))
        
        # Session header
        content.append(Paragraph(session_data['title'], styles['Title']))
        
        # Session metadata
        if 'description' in session_data and session_data['description']:
            content.append(Paragraph(session_data['description'], styles['Normal']))
            content.append(Spacer(1, 6))
        
        metadata = []
        created_at = session_data.get('created_at')
        if isinstance(created_at, str):
            metadata.append(f"Date: {created_at}")
        elif isinstance(created_at, (int, float)):
            dt = datetime.fromtimestamp(created_at)
            metadata.append(f"Date: {dt.strftime('%Y-%m-%d %H:%M:%S')}")
        
        duration = session_data.get('duration', 0)
        if duration:
            metadata.append(f"Duration: {format_timestamp(duration)}")
        
        if metadata:
            meta_text = " | ".join(metadata)
            content.append(Paragraph(meta_text, styles['Normal']))
            content.append(Spacer(1, 12))
        
        # Add summaries
        if include_summary and 'summaries' in session_data and session_data['summaries']:
            content.append(Paragraph("Summary", styles['Heading2']))
            
            # Group summaries by type
            summary_types = {}
            for summary in session_data['summaries']:
                summary_type = summary.get('summary_type', 'overall')
                if summary_type not in summary_types:
                    summary_types[summary_type] = []
                summary_types[summary_type].append(summary)
            
            # Add each summary type
            for summary_type, summaries in summary_types.items():
                content.append(Paragraph(f"{summary_type.capitalize()}", styles['Heading3']))
                
                for summary in summaries:
                    # Add segment time range if available
                    if 'segment_start' in summary and 'segment_end' in summary:
                        start_time = format_timestamp(summary['segment_start'])
                        end_time = format_timestamp(summary['segment_end'])
                        content.append(Paragraph(f"{start_time} - {end_time}", styles['Timestamp']))
                    
                    # Add summary text
                    content.append(Paragraph(summary['text'], styles['Normal']))
                    content.append(Spacer(1, 6))
        
        # Add transcription
        if include_transcription and 'transcriptions' in session_data and session_data['transcriptions']:
            content.append(Paragraph("Transcript", styles['Heading2']))
            
            # Sort transcriptions by timestamp
            transcriptions = sorted(session_data['transcriptions'], key=lambda x: x.get('timestamp', 0))
            
            for transcription in transcriptions:
                # Create a table for each transcription entry
                table_data = []
                
                # Format timestamp
                timestamp = transcription.get('timestamp', 0)
                formatted_time = format_timestamp(timestamp)
                table_data.append([Paragraph(f"[{formatted_time}]", styles['Timestamp'])])
                
                # Add speaker if available
                text_style = styles['Normal']
                if 'speaker' in transcription and transcription['speaker']:
                    speaker = Paragraph(f"{transcription['speaker']}:", styles['Speaker'])
                    table_data.append([speaker])
                
                # Add transcription text
                table_data.append([Paragraph(transcription['text'], text_style)])
                
                # Create table
                table = Table(table_data, colWidths=[450])
                table.setStyle(TableStyle([
                    ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 0), (-1, -1), 0),
                ]))
                
                content.append(table)
                content.append(Spacer(1, 6))
        
        # Build the PDF
        doc.build(content)
        logger.info(f"PDF export saved to {output_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error generating PDF export: {e}")
        return False

# Function to export a session to a specific format
def export_session(session_id: str, format_type: str = "markdown", output_path: Optional[str] = None,
                  include_transcription: bool = True, include_summary: bool = True,
                  db=None) -> Union[str, bool]:
    """
    Export a session to a specific format
    
    Args:
        session_id: ID of the session to export
        format_type: Export format ("markdown" or "pdf")
        output_path: Path to save the export (required for PDF)
        include_transcription: Whether to include the transcription
        include_summary: Whether to include the summary
        db: Database session
        
    Returns:
        For Markdown: The Markdown content as a string
        For PDF: True if successful, False otherwise
    """
    try:
        # Import database models here to avoid circular imports
        from app.models.models import Session, Transcription, Summary
        from app.database import SessionLocal
        
        # Create a database session if not provided
        close_db = False
        if db is None:
            db = SessionLocal()
            close_db = True
        
        try:
            # Get session data
            session = db.query(Session).filter(Session.id == session_id).first()
            if not session:
                logger.error(f"Session not found: {session_id}")
                return False if format_type == "pdf" else f"# Error\n\nSession not found: {session_id}"
            
            # Get transcriptions
            transcriptions = db.query(Transcription).filter(Transcription.session_id == session_id).all()
            
            # Get summaries
            summaries = db.query(Summary).filter(Summary.session_id == session_id).all()
            
            # Prepare session data
            session_data = {
                "id": session.id,
                "title": session.title,
                "description": session.description,
                "created_at": session.created_at.isoformat() if hasattr(session.created_at, 'isoformat') else session.created_at,
                "duration": session.duration,
                "transcriptions": [{
                    "id": t.id,
                    "timestamp": t.timestamp,
                    "end_timestamp": t.end_timestamp,
                    "text": t.text,
                    "speaker": t.speaker,
                    "confidence": t.confidence
                } for t in transcriptions] if include_transcription else [],
                "summaries": [{
                    "id": s.id,
                    "summary_type": s.summary_type,
                    "text": s.text,
                    "segment_start": s.segment_start,
                    "segment_end": s.segment_end
                } for s in summaries] if include_summary else []
            }
            
            # Generate export based on format
            if format_type.lower() == "markdown":
                return export_to_markdown(session_data, include_transcription, include_summary)
            elif format_type.lower() == "pdf":
                if not output_path:
                    # Generate a default output path if not provided
                    output_dir = os.path.join(tempfile.gettempdir(), "clariimeet_exports")
                    os.makedirs(output_dir, exist_ok=True)
                    output_path = os.path.join(output_dir, f"session_{session_id}_{int(time.time())}.pdf")
                
                return export_to_pdf(session_data, output_path, include_transcription, include_summary)
            else:
                logger.error(f"Unsupported export format: {format_type}")
                return False if format_type == "pdf" else f"# Error\n\nUnsupported export format: {format_type}"
        
        finally:
            # Close the database session if we created it
            if close_db:
                db.close()
    
    except Exception as e:
        logger.error(f"Error exporting session: {e}")
        return False if format_type == "pdf" else f"# Error\n\nFailed to export session: {str(e)}"

# API function to get supported export formats
def get_supported_export_formats() -> List[Dict[str, Any]]:
    """
    Get a list of supported export formats
    
    Returns:
        List of dictionaries with format information
    """
    formats = [
        {
            "id": "markdown",
            "name": "Markdown",
            "extension": ".md",
            "mime_type": "text/markdown",
            "description": "Simple text-based format with formatting",
            "available": True
        }
    ]
    
    # Add PDF if available
    formats.append({
        "id": "pdf",
        "name": "PDF Document",
        "extension": ".pdf",
        "mime_type": "application/pdf",
        "description": "Portable Document Format for printing and sharing",
        "available": PDF_EXPORT_AVAILABLE
    })
    
    return formats
