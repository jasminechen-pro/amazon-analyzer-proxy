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

    // 在服务器端稳定地处理流并聚合结果
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // 尝试从buffer中分割出完整的JSON块
        // Google的流返回的是一个JSON数组，以`[`开始，以`]`结束
        // 我们需要找到闭合的JSON对象
        let endOfJsonObject = buffer.lastIndexOf('}');
        if (endOfJsonObject !== -1) {
            let processableChunk = buffer.substring(0, endOfJsonObject + 1);
            buffer = buffer.substring(endOfJsonObject + 1);

            // 清理并解析
            const jsonObjects = `[${processableChunk.replace(/,$/, '')}]`;
            try {
                const data = JSON.parse(jsonObjects);
                data.forEach(item => {
                    if (item.candidates && item.candidates[0].content) {
                        fullText += item.candidates[0].content.parts[0].text;
                    }
                });
            } catch (e) {
                // 忽略解析错误，等待更多数据
            }
        }
    }

    if (!fullText) {
      return res.status(500).json({ error: 'Failed to extract content from Gemini stream.' });
    }

    // 返回一个完整的JSON响应
    res.status(200).json({ report: fullText });

  } catch (error) {
    console.error('Proxy internal error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

