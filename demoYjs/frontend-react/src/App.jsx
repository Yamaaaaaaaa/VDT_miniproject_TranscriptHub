import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import SegmentCard from './components/SegmentCard';

const sampleSegments = [
  { id: 'seg-1', speaker: 'Nguyễn Văn Minh - Trưởng nhóm', text: 'Chào cả nhà, hôm nay chúng ta có buổi họp weekly meeting. Trước tiên, mình xin phép kiểm tra tiến độ sprint hiện tại.', startTime: 0, endTime: 8 },
  { id: 'seg-2', speaker: 'Trần Thị Lan - Dev', text: 'Về phần API Gateway, mình đã hoàn thành 80% các endpoint cơ bản. Còn lại phần authentication và rate limiting dự kiến xong vào thứ 6.', startTime: 8, endTime: 20 },
  { id: 'seg-3', speaker: 'Lê Hoàng Nam - Dev', text: 'Backend của mình đã tích hợp xong với PostgreSQL. Các migration đều chạy ok, không có conflict gì cả.', startTime: 20, endTime: 30 },
  { id: 'seg-4', speaker: 'Phạm Thu Hà - QA', text: 'Mình đã viết test cases cho các feature mới. Trong tuần này sẽ tập trung vào integration testing và regression testing.', startTime: 30, endTime: 42 },
  { id: 'seg-5', speaker: 'Nguyễn Văn Minh - Trưởng nhóm', text: 'Tốt lắm. Vậy còn phần Frontend thì sao? Có blockers gì không?', startTime: 42, endTime: 50 },
  { id: 'seg-6', speaker: 'Hoàng Minh Tuấn - FE Dev', text: 'UI components đã xong, mình đang implement collaborative editing feature. Dự kiến cần thêm 2 ngày nữa để hoàn thiện real-time sync.', startTime: 50, endTime: 62 },
  { id: 'seg-7', speaker: 'Trần Thị Lan - Dev', text: 'À mình có trao đổi với Tuấn về WebSocket integration. Cần phải define rõ protocol để đảm bảo sync data consistency giữa client và server.', startTime: 62, endTime: 75 },
  { id: 'seg-8', speaker: 'Hoàng Minh Tuấn - FE Dev', text: 'Đúng rồi, mình đang dùng thử Yjs cho collaborative editing. Cấu trúc dữ liệu mình thiết kế theo Y.Array chứa Y.Map cho các segments.', startTime: 75, endTime: 88 },
  { id: 'seg-9', speaker: 'Lê Hoàng Nam - Dev', text: 'Nghe hay đấy. Mình cũng muốn tìm hiểu thêm về Yjs. Có documentation không?', startTime: 88, endTime: 95 },
  { id: 'seg-10', speaker: 'Hoàng Minh Tuấn - FE Dev', text: 'Có đấy, trang chủ yjs.dev có đầy đủ. Mình sẽ share link vào channel sau buổi họp nhé.', startTime: 95, endTime: 103 },
];

const userNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'];
const userColors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

function getRandomUser() {
  const idx = Math.floor(Math.random() * userNames.length);
  return {
    name: userNames[idx],
    color: userColors[idx],
    id: Math.random().toString(36).substr(2, 9)
  };
}

function App() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [segments, setSegments] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [roomId, setRoomId] = useState('transcript-demo');
  const [segmentYTexts, setSegmentYTexts] = useState({});
  
  const ydocRef = useRef(null);
  const wsProviderRef = useRef(null);
  const indexeddbRef = useRef(null);
  const segmentsArrayRef = useRef(null);

  // Helper to get editing users for a segment
  const getEditingUsersForSegment = useCallback((segmentId) => {
    if (!wsProviderRef.current || !ydocRef.current) return [];
    
    const states = wsProviderRef.current.awareness.getStates();
    const users = [];
    
    states.forEach((state, clientId) => {
      if (state.user && clientId !== ydocRef.current.clientID && state.editingSegment === segmentId) {
        users.push(state.user);
      }
    });
    
    return users;
  }, []);

  // Update segments from Y.Array
  const updateSegments = useCallback(() => {
    if (!segmentsArrayRef.current) return;
    
    const segs = segmentsArrayRef.current.toArray().map(yMap => ({
      id: yMap.get('id'),
      speaker: yMap.get('speaker'),
      text: yMap.get('text'),
      startTime: yMap.get('startTime'),
      endTime: yMap.get('endTime')
    }));
    
    setSegments(segs);
    
    // Get or create Y.Text for each segment
    if (ydocRef.current) {
      const yTexts = {};
      segs.forEach(seg => {
        const yText = ydocRef.current.getText(`segment-text:${seg.id}`);
        yTexts[seg.id] = yText;
      });
      setSegmentYTexts(yTexts);
    }
  }, []);

  // Update online users
  const updateOnlineUsers = useCallback(() => {
    if (!wsProviderRef.current) return;
    
    const states = wsProviderRef.current.awareness.getStates();
    const users = [];
    
    states.forEach((state) => {
      if (state.user) users.push(state.user);
    });
    
    setOnlineUsers(users);
  }, []);

  // Initialize Yjs
  const initYjs = useCallback((room) => {
    // Cleanup
    if (wsProviderRef.current) wsProviderRef.current.destroy();
    if (indexeddbRef.current) indexeddbRef.current.destroy();
    if (ydocRef.current) ydocRef.current.destroy();

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    
    const segmentsArray = ydoc.getArray('segments');
    segmentsArrayRef.current = segmentsArray;

    // IndexedDB
    const indexeddb = new IndexeddbPersistence(room, ydoc);
    indexeddbRef.current = indexeddb;
    
    indexeddb.once('synced', () => {
      if (segmentsArray.length === 0) {
        ydoc.transact(() => {
          sampleSegments.forEach(seg => {
            const yMap = new Y.Map();
            Object.entries(seg).forEach(([k, v]) => yMap.set(k, v));
            segmentsArray.push([yMap]);
          });
        });
      }
      updateSegments();
    });

    // WebSocket
    const wsProvider = new WebsocketProvider('ws://localhost:1234', room, ydoc);
    wsProviderRef.current = wsProvider;

    // User
    const user = getRandomUser();
    setCurrentUser(user);
    wsProvider.awareness.setLocalStateField('user', user);

    // Status
    setConnecting(true);
    wsProvider.on('status', (event) => {
      if (event.status === 'connected') {
        setConnected(true);
        setConnecting(false);
      } else if (event.status === 'disconnected') {
        setConnected(false);
        setConnecting(false);
      }
    });

    // Awareness changes
    wsProvider.awareness.on('change', () => {
      updateOnlineUsers();
      updateSegments();
    });

    // Segments observer
    segmentsArray.observe(() => {
      updateSegments();
    });

    updateSegments();
  }, [updateSegments, updateOnlineUsers]);

  // Handle join
  const handleJoin = () => {
    initYjs(roomId);
  };

  // Handle add segment
  const handleAddSegment = () => {
    if (!segmentsArrayRef.current || !currentUser) return;
    
    const now = Date.now();
    const newSeg = {
      id: `seg-${now}`,
      speaker: currentUser.name,
      text: 'Nội dung segment mới...',
      startTime: Math.floor(now / 1000) % 3600,
      endTime: Math.floor(now / 1000) % 3600 + 5
    };
    
    const yMap = new Y.Map();
    Object.entries(newSeg).forEach(([k, v]) => yMap.set(k, v));
    segmentsArrayRef.current.push([yMap]);
  };

  // Handle delete segment
  const handleDeleteSegment = (index) => {
    if (!segmentsArrayRef.current) return;
    segmentsArrayRef.current.delete(index, 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Transcript Collaboration</h1>
              <p className="text-gray-500 text-sm mt-1">Quill + Yjs + React</p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Current User */}
              {currentUser && (
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{
                    backgroundColor: `${currentUser.color}20`,
                    color: currentUser.color
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: currentUser.color }}
                  />
                  {currentUser.name}
                </div>
              )}
              
              {/* Connection Status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                connected ? 'bg-green-50 text-green-600' :
                connecting ? 'bg-yellow-50 text-yellow-600' :
                'bg-gray-100 text-gray-500'
              }`}>
                <span className={`w-2 h-2 rounded-full animate-pulse ${
                  connected ? 'bg-green-500' :
                  connecting ? 'bg-yellow-500' :
                  'bg-gray-400'
                }`} />
                {connected ? 'Connected' : connecting ? 'Connecting...' : 'Offline'}
              </div>
              
              {/* Online Count */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-full text-sm text-blue-600">
                <span>👥</span>
                <span>{onlineUsers.length}</span>
              </div>
            </div>
          </div>
          
          {/* Online Users */}
          {onlineUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="text-xs text-gray-500 font-medium self-center">Đang cộng tác:</span>
              {onlineUsers.map((user, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                  style={{ background: `${user.color}20`, color: user.color }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: user.color }} />
                  {user.name}
                </div>
              ))}
            </div>
          )}
          
          {/* Controls */}
          <div className="flex gap-3">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              placeholder="Room ID"
              className="flex-1 px-4 py-2 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={handleJoin}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl hover:bg-blue-600 transition-colors"
            >
              Tham gia
            </button>
            <button
              onClick={handleAddSegment}
              className="px-6 py-2 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-colors"
            >
              + Thêm Segment
            </button>
          </div>
        </div>

        {/* Segments */}
        <div className="space-y-4">
          {segments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg">Chưa có segment nào</p>
              <p className="text-sm mt-2">Nhấn "Tham gia" để bắt đầu</p>
            </div>
          ) : (
            segments.map((segment, index) => (
              <SegmentCard
                key={segment.id}
                segment={segment}
                yText={segmentYTexts[segment.id]}
                awareness={wsProviderRef.current?.awareness}
                isBeingEdited={getEditingUsersForSegment(segment.id).length > 0}
                editingUsers={getEditingUsersForSegment(segment.id)}
                onDelete={() => handleDeleteSegment(index)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
