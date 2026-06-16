# STEP-06: Frontend Integration

## Mục Tiêu

Tích hợp collaborative editor vào Next.js frontend sử dụng Yjs và Quill.

## Dependencies

- ✅ STEP-00 (Prerequisites)
- ✅ STEP-02 (Collab Service)
- ✅ STEP-03 (Meeting Service)
- ✅ STEP-04 (Collab Gateway)
- ✅ STEP-05 (Docker & Deployment)

## Checklist

- [ ] Cài đặt packages (yjs, y-quill, quill)
- [ ] Tạo Yjs provider wrapper
- [ ] Tạo CollaborativeEditor component
- [ ] Tích hợp vào transcript page
- [ ] Implement auto-save (character count)
- [ ] Update WebSocket URL cho production

---

## 1. Cài Đặt Packages

### 1.1. Frontend Dependencies

```bash
cd fe_next
npm install yjs y-quill quill quill-delta y-protocols lib0
```

### 1.2. Thêm vào `fe_next/package.json`

```json
{
  "dependencies": {
    "yjs": "^13.6.0",
    "y-quill": "^1.0.0",
    "quill": "^2.0.0",
    "quill-delta": "^5.1.0",
    "y-protocols": "^1.0.0",
    "lib0": "^0.2.99"
  }
}
```

---

## 2. Tạo Collaborative Manager

### 2.1. Yjs Provider Wrapper

```typescript
// fe_next/lib/collab-manager.ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { QuillBinding } from 'y-quill';
import Quill from 'quill';

export interface CollabManagerOptions {
  meetingId: string;
  token: string;
  websocketUrl?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onAwarenessChange?: (users: AwarenessUser[]) => void;
}

export interface AwarenessUser {
  id: number;
  name?: string;
  color?: string;
}

export class CollaborativeManager {
  private doc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private binding: QuillBinding | null = null;
  private quill: Quill | null = null;

  constructor() {
    this.doc = new Y.Doc();
  }

  connect(options: CollabManagerOptions): void {
    const { meetingId, token, websocketUrl, onConnected, onDisconnected, onAwarenessChange } = options;

    // Default: connect to collab-gateway (local dev hoặc docker)
    const wsUrl = websocketUrl || 'ws://localhost:3008';

    this.provider = new WebsocketProvider(
      wsUrl,
      `/ws/collab?meetingId=${meetingId}&token=${token}`,
      this.doc,
    );

    this.provider.on('status', ({ status }: { status: string }) => {
      console.log('WebSocket status:', status);
      if (status === 'connected' && onConnected) {
        onConnected();
      } else if (status === 'disconnected' && onDisconnected) {
        onDisconnected();
      }
    });

    if (onAwarenessChange) {
      this.provider.awareness.on('change', () => {
        const states = this.provider!.awareness.getStates();
        const users: AwarenessUser[] = [];
        states.forEach((state, clientId) => {
          if (state.user) {
            users.push({
              id: clientId,
              name: state.user.name,
              color: state.user.color,
            });
          }
        });
        onAwarenessChange(users);
      });
    }
  }

  bindQuill(quillEditor: Quill): void {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }

    this.quill = quillEditor;
    this.binding = new QuillBinding(
      this.doc.getText('quill'),
      quillEditor,
      this.provider.awareness,
    );
  }

  setUserInfo(name: string, color: string): void {
    if (this.provider) {
      this.provider.awareness.setLocalStateField('user', {
        name,
        color,
      });
    }
  }

  getYText(): Y.Text | null {
    return this.doc.getText('quill');
  }

  getRawText(): string {
    return this.quill?.getText() || '';
  }

  getStructuredContent(): any {
    if (!this.quill) return { segments: [] };

    const delta = this.quill.getContents();
    return {
      segments: this.deltaToSegments(delta),
    };
  }

  private deltaToSegments(delta: any): any[] {
    const segments: any[] = [];
    let currentIndex = 0;

    if (delta && delta.ops) {
      delta.ops.forEach((op: any, index: number) => {
        if (typeof op.insert === 'string') {
          segments.push({
            id: `seg-${index}`,
            text: op.insert,
            index: currentIndex,
          });
          currentIndex += op.insert.length;
        }
      });
    }

    return segments;
  }

  disconnect(): void {
    if (this.binding) {
      this.binding.destroy();
      this.binding = null;
    }

    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }

    this.doc.destroy();
    this.quill = null;
  }

  isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }
}

// Singleton instance
let collabManager: CollaborativeManager | null = null;

export function getCollabManager(): CollaborativeManager {
  if (!collabManager) {
    collabManager = new CollaborativeManager();
  }
  return collabManager;
}

export function destroyCollabManager(): void {
  if (collabManager) {
    collabManager.disconnect();
    collabManager = null;
  }
}
```

---

## 3. Tạo Collaborative Editor Component

### 3.1. CollaborativeEditor Component

```tsx
// fe_next/components/collaborative-editor/CollaborativeEditor.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import {
  CollaborativeManager,
  getCollabManager,
  destroyCollabManager,
  AwarenessUser,
} from '@/lib/collab-manager';

interface CollaborativeEditorProps {
  meetingId: string;
  token: string;
  userName: string;
  userId: number;
  initialContent?: string;
  editable?: boolean;
  onSave?: (rawText: string, structuredContent: any) => void;
  onAutoSave?: (rawText: string, structuredContent: any) => void;
}

export default function CollaborativeEditor({
  meetingId,
  token,
  userName,
  userId,
  initialContent = '',
  editable = true,
  onSave,
  onAutoSave,
}: CollaborativeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const managerRef = useRef<CollaborativeManager | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<AwarenessUser[]>([]);
  const charCountRef = useRef(0);

  // Initialize Quill
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ script: 'sub' }, { script: 'super' }],
          ['clean'],
        ],
      },
      readOnly: !editable,
    });

    if (initialContent) {
      quill.setText(initialContent);
    }

    quillRef.current = quill;

    return () => {
      destroyCollabManager();
      quillRef.current = null;
    };
  }, [editable, initialContent]);

  // Connect to collaboration server
  useEffect(() => {
    if (!quillRef.current) return;

    const manager = getCollabManager();
    managerRef.current = manager;

    manager.connect({
      meetingId,
      token,
      onConnected: () => {
        setIsConnected(true);
        manager.bindQuill(quillRef.current!);
        manager.setUserInfo(userName, getRandomColor());

        if (!initialContent) {
          const text = manager.getRawText();
          if (text && text.trim()) {
            quillRef.current?.setText(text);
          }
        }
      },
      onDisconnected: () => {
        setIsConnected(false);
      },
      onAwarenessChange: (users) => {
        setActiveUsers(users);
      },
    });

    return () => {
      manager.disconnect();
    };
  }, [meetingId, token, userName, initialContent]);

  // Auto-save logic (5 characters)
  useEffect(() => {
    if (!quillRef.current || !editable) return;

    const quill = quillRef.current;

    const handleTextChange = () => {
      const currentText = quill.getText();
      const newCharCount = currentText.length;
      const diff = newCharCount - charCountRef.current;
      charCountRef.current = newCharCount;

      if (diff >= 5 && onAutoSave) {
        const rawText = managerRef.current?.getRawText() || '';
        const structuredContent = managerRef.current?.getStructuredContent() || {};
        onAutoSave(rawText, structuredContent);
        console.log('Auto-saved after 5 characters');
      }
    };

    quill.on('text-change', handleTextChange);

    return () => {
      quill.off('text-change', handleTextChange);
    };
  }, [editable, onAutoSave]);

  // Manual save
  const handleManualSave = useCallback(() => {
    if (!managerRef.current || !onSave) return;

    const rawText = managerRef.current.getRawText();
    const structuredContent = managerRef.current.getStructuredContent();
    onSave(rawText, structuredContent);
    console.log('Manual save triggered');
  }, [onSave]);

  return (
    <div className="collab-editor-container">
      <div className="status-bar">
        <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
        {activeUsers.length > 0 && (
          <span className="active-users">
            {activeUsers.length} user{activeUsers.length > 1 ? 's' : ''} online
          </span>
        )}
        {editable && (
          <button onClick={handleManualSave} className="save-btn">
            Save Now
          </button>
        )}
      </div>

      <div className="user-avatars">
        {activeUsers.map((user) => (
          <div
            key={user.id}
            className="user-avatar"
            style={{ backgroundColor: user.color }}
            title={user.name || `User ${user.id}`}
          >
            {user.name?.charAt(0) || '?'}
          </div>
        ))}
      </div>

      <div ref={editorRef} className="quill-editor" />

      <style jsx>{`
        .collab-editor-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .status-bar {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 8px 12px;
          background: #f5f5f5;
          border-radius: 4px;
        }

        .status-indicator {
          font-size: 12px;
          font-weight: 500;
          padding: 2px 8px;
          border-radius: 4px;
        }

        .status-indicator.connected {
          background: #4caf50;
          color: white;
        }

        .status-indicator.disconnected {
          background: #f44336;
          color: white;
        }

        .active-users {
          font-size: 12px;
          color: #666;
        }

        .save-btn {
          margin-left: auto;
          padding: 4px 12px;
          background: #2196f3;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }

        .save-btn:hover {
          background: #1976d2;
        }

        .user-avatars {
          display: flex;
          gap: 5px;
        }

        .user-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 12px;
          font-weight: bold;
        }

        .quill-editor {
          height: 400px;
          background: white;
        }

        :global(.quill-editor .ql-editor) {
          min-height: 300px;
        }
      `}</style>
    </div>
  );
}

function getRandomColor(): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}
```

### 3.2. Export Component

```typescript
// fe_next/components/collaborative-editor/index.ts
export { default as CollaborativeEditor } from './CollaborativeEditor';
```

---

## 4. Tích Hợp vào Transcript Page

### 4.1. Cập nhật transcript page

```tsx
// fe_next/app/(dashboard)/transcripts/[fileId]/page.tsx
'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { CollaborativeEditor } from '@/components/collaborative-editor';

export default function TranscriptPage() {
  const params = useParams();
  const fileId = params.fileId as string;

  // Mock data - replace with actual auth context
  const token = 'your-jwt-token';
  const userName = 'John Doe';
  const userId = 1;
  const meetingId = fileId;

  const handleSave = useCallback(async (rawText: string, structuredContent: any) => {
    console.log('Manual save:', { rawText, structuredContent });

    try {
      const response = await fetch('/api/collab/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          rawText,
          structuredContent,
        }),
      });

      if (response.ok) {
        console.log('Save successful');
      }
    } catch (err) {
      console.error('Save failed:', err);
    }
  }, [meetingId]);

  const handleAutoSave = useCallback(async (rawText: string, structuredContent: any) => {
    console.log('Auto-save:', { rawText, structuredContent });

    try {
      await fetch('/api/collab/auto-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingId,
          rawText,
          structuredContent,
        }),
      });
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }, [meetingId]);

  return (
    <div className="transcript-page">
      <h1>Transcript Editor</h1>
      <CollaborativeEditor
        meetingId={meetingId}
        token={token}
        userName={userName}
        userId={userId}
        editable={true}
        onSave={handleSave}
        onAutoSave={handleAutoSave}
      />
    </div>
  );
}
```

---

## 5. Cấu Hình WebSocket URL

### 5.1. Environment-based configuration

```typescript
// fe_next/lib/collab-manager.ts (cập nhật connect function)
const getWebSocketUrl = () => {
  // Production: Docker container
  if (process.env.NEXT_PUBLIC_COLLAB_WS_URL) {
    return process.env.NEXT_PUBLIC_COLLAB_WS_URL;
  }
  // Local development
  return 'ws://localhost:3008';
};
```

### 5.2. Thêm vào .env.local

```env
# Development (local)
NEXT_PUBLIC_COLLAB_WS_URL=ws://localhost:3008

# Production (Docker)
# NEXT_PUBLIC_COLLAB_WS_URL=ws://collab-gateway:3008
```

---

## 6. Testing

### 6.1. Kiểm tra packages

```bash
cd fe_next
npm list yjs y-quill quill
```

### 6.2. Build Next.js

```bash
cd fe_next
npm run build
```

### 6.3. Manual Test

1. Start Docker: `docker-compose up -d collab-service collab-gateway`
2. Start Next.js: `npm run dev` trong `fe_next`
3. Mở trình duyệt vào transcript page
4. Kiểm tra:
   - WebSocket kết nối thành công (status indicator xanh)
   - Gõ text → text xuất hiện realtime
   - Sau 5 ký tự → auto-save được trigger
   - Mở 2 tab → thấy user avatars của nhau

---

## Output Sau Step Này

Sau khi hoàn thành STEP-06:

1. ✅ CollaborativeEditor component đã được tạo
2. ✅ Yjs provider wrapper đã được implement
3. ✅ Auto-save logic (5 characters) đã được implement
4. ✅ Tích hợp vào transcript page
5. ✅ WebSocket URL được cấu hình theo environment

---

## Tổng Kết

Bạn đã hoàn thành tất cả 6 steps để triển khai Collab Service:

1. ✅ STEP-00: Chuẩn bị môi trường
2. ✅ STEP-01: Database Schema
3. ✅ STEP-02: Collab Service (TCP RPC Server)
4. ✅ STEP-03: Meeting Service TCP Endpoint
5. ✅ STEP-04: Collab Gateway (WebSocket Server)
6. ✅ STEP-05: Docker & Deployment
7. ✅ STEP-06: Frontend Integration

Hệ thống collaborative editing đã sẵn sàng để sử dụng!
