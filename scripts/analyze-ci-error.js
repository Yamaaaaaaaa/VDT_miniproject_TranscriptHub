const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');

async function analyze() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY found, skipping AI analysis.");
    return "Không cấu hình GEMINI_API_KEY để phân tích lỗi.";
  }

  const logPath = path.join(__dirname, '../error.log');
  if (!fs.existsSync(logPath)) {
    console.log("No error.log found.");
    return "Không tìm thấy file error.log để phân tích.";
  }

  const logContent = fs.readFileSync(logPath, 'utf8');
  // Lấy tối đa 150 dòng cuối cùng để gửi cho AI
  const trimmedLog = logContent.split('\n').slice(-150).join('\n');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `
Bạn là một kỹ sư DevOps và Lập trình viên NodeJS chuyên nghiệp.
Hãy phân tích đoạn log lỗi CI/CD dưới đây của dự án Node.js/Next.js/NestJS.
Chỉ ra nguyên nhân chính xác và gợi ý các dòng code cần sửa một cách ngắn gọn, súc tích bằng tiếng Việt (sử dụng định dạng Markdown).

Log lỗi:
\`\`\`
${trimmedLog}
\`\`\`
  `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error("AI Analysis failed:", error);
    return "Gặp lỗi trong quá trình kết nối với AI Agent để phân tích.";
  }
}

analyze().then(analysis => console.log(analysis));
