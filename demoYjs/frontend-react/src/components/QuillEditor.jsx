import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';

export default function QuillEditor({ yText, segmentId, awareness, initialText }) {
  const containerRef = useRef(null);
  const quillRef = useRef(null);
  const isRemoteUpdate = useRef(false);
  const isInitialized = useRef(false);

  useEffect(() => {
    if (!containerRef.current || !yText) return;

    // Create Quill instance
    const quill = new Quill(containerRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false
      }
    });

    quillRef.current = quill;

    // Convert Delta to plain text
    const deltaToText = (delta) => {
      if (!delta || !delta.ops) return '';
      return delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('');
    };

    // Local change → Y.Text
    quill.on('text-change', (delta, oldDelta, source) => {
      if (source !== 'user' || isRemoteUpdate.current) return;

      // Get full text from quill
      const text = quill.getText().replace(/\n$/, ''); // remove trailing newline
      
      yText.doc.transact(() => {
        yText.delete(0, yText.length);
        if (text.length > 0) {
          yText.insert(0, text);
        }
      });
    });

    // Y.Text change → Quill (remote only)
    const yTextObserver = (event, transaction) => {
      if (transaction.local) return;

      isRemoteUpdate.current = true;
      const yTextContent = yText.toString();
      const currentText = quill.getText().replace(/\n$/, '');

      if (yTextContent !== currentText) {
        quill.setText(yTextContent);
      }
      isRemoteUpdate.current = false;
    };

    yText.observe(yTextObserver);

    // Initial content
    const initialContent = yText.length > 0 ? yText.toString() : (initialText || '');
    if (initialContent) {
      isRemoteUpdate.current = true;
      yText.doc.transact(() => {
        yText.delete(0, yText.length);
        yText.insert(0, initialContent);
      });
      quill.setText(initialContent);
      isRemoteUpdate.current = false;
    }
    
    isInitialized.current = true;

    // Track focus for awareness
    quill.on('selection-change', (range) => {
      if (!awareness) return;
      
      if (range) {
        awareness.setLocalStateField('editingSegment', segmentId);
        awareness.setLocalStateField('editingCursor', range.index);
      } else {
        awareness.setLocalStateField('editingSegment', null);
        awareness.setLocalStateField('editingCursor', null);
      }
    });

    return () => {
      yText.unobserve(yTextObserver);
    };
  }, [yText, segmentId, awareness, initialText]);

  return (
    <div className="quill-wrapper">
      <div ref={containerRef} className="quill-editor-container" />
      
      <style>{`
        .quill-wrapper {
          border: 1px solid #e5e7eb;
          border-radius: 0.75rem;
          overflow: hidden;
          background: white;
        }
        
        .quill-editor-container .ql-toolbar {
          border: none !important;
          border-bottom: 1px solid #e5e7eb !important;
          background: #f9fafb;
          padding: 8px 12px !important;
        }
        
        .quill-editor-container .ql-container {
          font-family: inherit !important;
          font-size: 14px !important;
          border: none !important;
        }
        
        .quill-editor-container .ql-editor {
          padding: 12px !important;
          min-height: 60px;
          color: #1f2937;
        }
        
        .quill-editor-container .ql-editor.ql-blank::before {
          color: #9ca3af;
          font-style: normal;
        }
        
        .quill-editor-container .ql-toolbar .ql-stroke {
          stroke: #6b7280;
        }
        
        .quill-editor-container .ql-toolbar .ql-fill {
          fill: #6b7280;
        }
        
        .quill-editor-container .ql-toolbar button:hover .ql-stroke,
        .quill-editor-container .ql-toolbar button.ql-active .ql-stroke {
          stroke: #3b82f6;
        }
        
        .quill-editor-container .ql-toolbar button:hover .ql-fill,
        .quill-editor-container .ql-toolbar button.ql-active .ql-fill {
          fill: #3b82f6;
        }
        
        .segment-card.editing .quill-wrapper {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
      `}</style>
    </div>
  );
}
