// 使用 Node.js 运行时，因为它更适合处理长时任务
// 删除文件顶部的 export const config = { runtime: 'edge' };

export default async function handler(req, res) {
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
    const requestBody = req.body; // Vercel 会自动解析 JSON body

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

    // 在服务器端处理流并聚合结果
    const reader = geminiResponse.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        // 移除Google流式API返回的特殊字符 `[` 和 `]`
        const cleanedChunk = chunk.replace(/^\[|\]$/g, '');
        
        // 分割可能存在的多个JSON对象
        cleanedChunk.split('\n').forEach(line => {
           if (line.trim()) {
               try {
                   const data = JSON.parse(line);
                   if (data && data.candidates && data.candidates[0].content) {
                       fullText += data.candidates[0].content.parts[0].text;
                   }
               } catch (parseError) {
                   // 忽略无法解析的行
               }
           }
        });
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

