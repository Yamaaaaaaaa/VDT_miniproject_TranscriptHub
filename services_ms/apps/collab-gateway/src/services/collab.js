const COLLAB_SERVICE_URL = process.env.COLLAB_SERVICE_URL || 'http://collab-service:3007';

export const collabService = {
  async getTranscript(meetingId) {
    try {
      const response = await fetch(`${COLLAB_SERVICE_URL}/collab/transcripts/${meetingId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        return { success: false };
      }
      const data = await response.json();
      return { success: true, data };
    } catch (err) {
      return { success: false };
    }
  },

  async saveSnapshot(meetingId, content) {
    try {
      const response = await fetch(`${COLLAB_SERVICE_URL}/collab/transcripts/${meetingId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(content),
      });
      return response.ok;
    } catch (err) {
      return false;
    }
  },
};
