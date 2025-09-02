// 使用 Node.js 运行时，因为它更适合处理长时任务
// 请确保此文件顶部没有 export const config = { runtime: 'edge' };

export default async function handler(req, res) {
  // 增加函数运行时长限制 (Vercel Pro plan needed for >60s)
  // 对于免费版，这会尽量延长到最大允许时间
  res.setHeader('X-Vercel-Max-Duration', '60');

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // 使用流式生成内容的API端点
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:streamGenerateContent?key=${geminiApiKey}`;

  try {
    const requestBody = req.body; // Vercel 在 Node.js 环境会自动解析 JSON

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      return res.status(geminiResponse.status).json({ error: `Gemini API Error: ${errorText}` });
    }

  // proxy.js

// ... (try 块内部)

// 在服务器端稳定地处理流并聚合结果
const reader = geminiResponse.body.getReader();
const decoder = new TextDecoder();
let chunks = [];

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(decoder.decode(value, { stream: true }));
}

// Gemini 的流式响应是一个分块的JSON数组
// 我们将所有块拼接起来，清理开头和结尾可能存在的 "data: " 或其他非JSON字符
// 然后尝试解析这个完整的JSON数组
let fullText = '';
try {
    // 拼接所有块并清理
    const fullResponseText = chunks.join('');
    
    // 移除流开头和结尾可能存在的方括号和换行符，以防万一
    const cleanedText = fullResponseText.replace(/^\[\s*|\s*\]$/g, '');

    // 流返回的是一系列独立的 JSON 对象，用逗号分隔，我们把它们重新包装成一个数组
    const jsonArrayString = `[${cleanedText}]`;
    
    const data = JSON.parse(jsonArrayString);
    data.forEach(item => {
        if (item.candidates && item.candidates[0].content) {
            fullText += item.candidates[0].content.parts[0].text;
        }
    });
} catch (e) {
    console.error('Failed to parse Gemini stream:', e);
    console.error('Raw response text:', chunks.join(''));
    return res.status(500).json({ error: 'Failed to parse content from Gemini stream.' });
}


if (!fullText) {
  return res.status(500).json({ error: 'Failed to extract content from Gemini stream.' });
}

// 返回一个完整的JSON响应
res.status(200).json({ report: fullText });

// ... (catch 块)


  } catch (error) {
    console.error('Proxy internal error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

