import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

// State
let ydoc = null;
let wsProvider = null;
let indexeddbProvider = null;
let segmentsArray = null;
let currentUser = null;

// Sample transcript data
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
    { id: 'seg-11', speaker: 'Phạm Thu Hà - QA', text: 'Còn vấn đề testing collaborative features này thì sao? Có cần approach đặc biệt không?', startTime: 103, endTime: 112 },
    { id: 'seg-12', speaker: 'Nguyễn Văn Minh - Trưởng nhóm', text: 'Đây là vấn đề hay. Mình đề xuất là sẽ tổ chức 1 session riêng để discuss về testing strategy cho real-time collaboration. Tuần sau nhé?', startTime: 112, endTime: 124 },
    { id: 'seg-13', speaker: 'Trần Thị Lan - Dev', text: 'OK, mình đồng ý. Trước mắt cứ focus vào core features đã, collaborative editing là stretch goal của sprint này.', startTime: 124, endTime: 135 },
    { id: 'seg-14', speaker: 'Nguyễn Văn Minh - Trưởng nhóm', text: 'Vậy mình tổng kết: Backend - thứ 6 xong auth và rate limiting. Frontend - thứ 6 xong UI, tuần sau xong collaborative. QA - chạy tests liên tục. Có ý kiến gì thêm không?', startTime: 135, endTime: 152 },
    { id: 'seg-15', speaker: 'Lê Hoàng Nam - Dev', text: 'Không có gì thêm. Mình sẽ prepare demo cho sprint review vào cuối tuần.', startTime: 152, endTime: 159 },
    { id: 'seg-16', speaker: 'Nguyễn Văn Minh - Trưởng nhóm', text: 'Perfect. Cảm ơn mọi người. Buổi họp kết thúc lúc 10 giờ 30 phút. Hẹn gặp lại tuần sau!', startTime: 159, endTime: 168 },
];

// User data
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

function initYjs(roomId) {
    // Cleanup
    if (wsProvider) wsProvider.destroy();
    if (indexeddbProvider) indexeddbProvider.destroy();
    if (ydoc) ydoc.destroy();

    ydoc = new Y.Doc();
    segmentsArray = ydoc.getArray('segments');

    // IndexedDB
    indexeddbProvider = new IndexeddbPersistence(roomId, ydoc);
    indexeddbProvider.once('synced', () => {
        if (segmentsArray.length === 0) {
            ydoc.transact(() => {
                sampleSegments.forEach(seg => {
                    const yMap = new Y.Map();
                    Object.entries(seg).forEach(([k, v]) => yMap.set(k, v));
                    segmentsArray.push([yMap]);
                });
            });
        }
        renderAll();
    });

    // WebSocket
    wsProvider = new WebsocketProvider('ws://localhost:1234', roomId, ydoc);

    // User
    currentUser = getRandomUser();
    wsProvider.awareness.setLocalStateField('user', currentUser);

    // UI
    const userInfoEl = document.getElementById('user-info');
    userInfoEl.style.backgroundColor = currentUser.color + '20';
    userInfoEl.style.color = currentUser.color;
    userInfoEl.innerHTML = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${currentUser.color}"></span> ${currentUser.name}`;

    // Status
    wsProvider.on('status', (event) => {
        const statusEl = document.getElementById('connection-status');
        if (event.status === 'connected') {
            statusEl.innerHTML = '<span class="online-badge bg-green-500"></span><span>Connected</span>';
            statusEl.className = 'flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full text-sm text-green-600';
        } else if (event.status === 'connecting') {
            statusEl.innerHTML = '<span class="online-badge bg-yellow-500"></span><span>Connecting...</span>';
            statusEl.className = 'flex items-center gap-2 px-3 py-1.5 bg-yellow-50 rounded-full text-sm text-yellow-600';
        } else {
            statusEl.innerHTML = '<span class="online-badge bg-gray-400"></span><span>Offline</span>';
            statusEl.className = 'flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full text-sm text-gray-500';
        }
    });

    // Awareness
    wsProvider.awareness.on('change', () => {
        updateOnlineUsers();
        updateEditorsIndicators();
    });

    // CRITICAL FIX: Use observeDeep with event.transaction.local check
    // This properly distinguishes local vs remote changes
    segmentsArray.observeDeep((events, transaction) => {
        // Skip if this is a local change (we already updated the textarea)
        if (transaction.local) return;
        
        events.forEach(event => {
            if (event.target instanceof Y.Map) {
                const segmentId = event.target.get('id');
                const newText = event.target.get('text');
                if (newText !== undefined) {
                    console.log('Remote update:', segmentId, newText);
                    updateTextareaInPlace(segmentId, newText);
                }
            }
        });
    });

    segmentsArray.observe((event) => {
        // Only re-render on add/remove, not on deep changes
        if (event.changes.added.length > 0 || event.changes.deleted.length > 0) {
            renderAll();
        }
    });

    renderAll();
}

function updateOnlineUsers() {
    if (!wsProvider) return;
    const states = wsProvider.awareness.getStates();
    const users = [];
    states.forEach((state) => {
        if (state.user) users.push(state.user);
    });
    
    document.getElementById('online-count').textContent = users.length;
    
    const listEl = document.getElementById('online-users-list');
    if (users.length > 0) {
        listEl.innerHTML = `
            <span class="text-xs text-gray-500 font-medium">Đang cộng tác:</span>
            ${users.map(u => `
                <div class="flex items-center gap-1 px-2 py-1 rounded-full text-xs" 
                     style="background: ${u.color}20; color: ${u.color}">
                    <span class="w-2 h-2 rounded-full" style="background: ${u.color}"></span>
                    <span>${u.name}</span>
                </div>
            `).join('')}
        `;
    } else {
        listEl.innerHTML = '';
    }
}

function updateEditorsIndicators() {
    if (!wsProvider) return;
    const states = wsProvider.awareness.getStates();
    
    document.querySelectorAll('.segment-card').forEach(card => {
        const segmentId = card.dataset.id;
        const editors = [];
        
        states.forEach((state, clientId) => {
            // Only show OTHER users editing this segment (not self)
            if (state.user && clientId !== ydoc.clientID && state.editingSegment === segmentId) {
                editors.push(state.user);
            }
        });
        
        const isBeingEdited = editors.length > 0;
        const indicatorEl = card.querySelector('.editors-indicator');
        
        if (isBeingEdited) {
            card.classList.add('ring-2', 'ring-blue-300');
            if (!indicatorEl) {
                const el = document.createElement('div');
                el.className = 'editors-indicator mt-2 flex flex-wrap items-center gap-2';
                card.appendChild(el);
            }
            card.querySelector('.editors-indicator').innerHTML = `
                <span class="text-xs text-gray-400">Đang sửa:</span>
                ${editors.map(e => `
                    <div class="flex items-center gap-1 px-2 py-1 rounded-full text-xs" 
                         style="background: ${e.color}20; color: ${e.color}">
                        <span class="w-2 h-2 rounded-full" style="background: ${e.color}"></span>
                        <span>${e.name}</span>
                    </div>
                `).join('')}
            `;
        } else {
            card.classList.remove('ring-2', 'ring-blue-300');
            if (indicatorEl) indicatorEl.remove();
        }
    });
}

function updateTextareaInPlace(segmentId, newText) {
    const textarea = document.querySelector(`textarea[data-segment-id="${segmentId}"]`);
    if (textarea) {
        // Only update if not currently focused (so we don't disrupt the user typing)
        if (document.activeElement !== textarea) {
            // Preserve cursor position by using setSelectionRange
            textarea.value = newText;
        } else {
            // User is typing - just update the value, browser handles cursor
            if (textarea.value !== newText) {
                textarea.value = newText;
            }
        }
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function renderAll() {
    const container = document.getElementById('segments-container');
    
    if (!segmentsArray || segmentsArray.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12 text-gray-400">
                <p class="text-lg">Chưa có segment nào</p>
                <p class="text-sm mt-2">Nhấn "Tham gia" để bắt đầu</p>
            </div>
        `;
        return;
    }

    const segments = segmentsArray.toArray();
    
    container.innerHTML = segments.map((yMap, index) => {
        const seg = {
            id: yMap.get('id'),
            speaker: yMap.get('speaker'),
            text: yMap.get('text'),
            startTime: yMap.get('startTime'),
            endTime: yMap.get('endTime')
        };
        
        return `
            <div class="segment-card bg-white rounded-2xl shadow-md p-5" data-id="${seg.id}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                            ${seg.speaker.charAt(0)}
                        </span>
                        <div>
                            <p class="font-semibold text-gray-800 text-sm">${seg.speaker}</p>
                            <p class="text-xs text-gray-400">${formatTime(seg.startTime)} - ${formatTime(seg.endTime)}</p>
                        </div>
                    </div>
                    <button class="btn-delete px-3 py-1 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100" data-index="${index}">
                        🗑️
                    </button>
                </div>
                
                <textarea 
                    class="segment-textarea w-full p-3 border border-gray-200 rounded-xl text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                    rows="3"
                    data-index="${index}"
                    data-segment-id="${seg.id}"
                >${seg.text}</textarea>
                
                <div class="editors-indicator mt-2 flex flex-wrap items-center gap-2"></div>
            </div>
        `;
    }).join('');

    // Event delegation
    container.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('segment-textarea')) {
            const segmentId = e.target.dataset.segmentId;
            if (wsProvider) {
                wsProvider.awareness.setLocalStateField('editingSegment', segmentId);
            }
        }
    });

    container.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('segment-textarea')) {
            setTimeout(() => {
                if (wsProvider && !document.activeElement?.classList.contains('segment-textarea')) {
                    wsProvider.awareness.setLocalStateField('editingSegment', null);
                }
            }, 100);
        }
    });

    container.addEventListener('input', (e) => {
        if (e.target.classList.contains('segment-textarea')) {
            const index = parseInt(e.target.dataset.index);
            const newText = e.target.value;
            
            const yMap = segmentsArray.get(index);
            if (yMap) {
                yMap.set('text', newText);
            }
        }
    });

    container.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-delete')) {
            const index = parseInt(e.target.dataset.index);
            segmentsArray.delete(index, 1);
        }
    });

    updateEditorsIndicators();
    updateOnlineUsers();
}

function addSegment() {
    const now = Date.now();
    const newSeg = {
        id: `seg-${now}`,
        speaker: currentUser ? currentUser.name : 'Người dùng mới',
        text: 'Nội dung segment mới...',
        startTime: Math.floor(now / 1000) % 3600,
        endTime: Math.floor(now / 1000) % 3600 + 5
    };
    
    const yMap = new Y.Map();
    Object.entries(newSeg).forEach(([k, v]) => yMap.set(k, v));
    segmentsArray.push([yMap]);
}

// Events
document.getElementById('btn-join').addEventListener('click', () => {
    const roomId = document.getElementById('room-id').value || 'transcript-demo';
    initYjs(roomId);
});

document.getElementById('btn-add-segment').addEventListener('click', addSegment);

// Init
renderAll();
