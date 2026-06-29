import QuillEditor from './QuillEditor';

export default function SegmentCard({ segment, yText, awareness, isBeingEdited, editingUsers, onDelete }) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`segment-card bg-white rounded-2xl shadow-md p-5 ${isBeingEdited ? 'editing ring-2 ring-blue-200' : ''}`}>
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
            {segment.speaker.charAt(0)}
          </span>
          <div>
            <p className="font-semibold text-gray-800">{segment.speaker}</p>
            <p className="text-xs text-gray-400">
              {formatTime(segment.startTime)} - {formatTime(segment.endTime)}
            </p>
          </div>
        </div>
        
        <button
          onClick={onDelete}
          className="px-3 py-1.5 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 transition-colors"
        >
          🗑️
        </button>
      </div>

      <QuillEditor
        yText={yText}
        segmentId={segment.id}
        awareness={awareness}
        initialText={segment.text}
      />

      {editingUsers && editingUsers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-400">Đang sửa:</span>
          {editingUsers.map((user, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
              style={{
                background: `${user.color}20`,
                color: user.color
              }}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: user.color }}
              />
              <span>{user.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
