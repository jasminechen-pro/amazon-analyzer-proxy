// Vercel Serverless Function
// 该函数会接收来自插件的请求，然后安全地调用Google AI API

export default async function handler(request, response) {
  // 只允许POST请求
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  // 从Vercel的环境变量中安全地获取API密钥，这个密钥不会暴露在前端
  // 注意：这里的API Key是我们自己提供的，无需用户配置
  const geminiApiKey = process.env.GEMINI_API_KEY; 
  if (!geminiApiKey) {
    return response.status(500).json({ error: 'API key not configured on server' });
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${geminiApiKey}`;

  try {
    // 将插件发来的请求体直接转发给Google
    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request.body), 
    });

    // 如果Google返回错误，将错误信息也转发回插件，方便调试
    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error("Gemini API Error:", errorBody);
      return response.status(geminiResponse.status).json({ error: `Google API error: ${geminiResponse.statusText}` });
    }

    // 成功后，将Google的返回结果转发回插件
    const data = await geminiResponse.json();
    return response.status(200).json(data);

  } catch (error) {
    console.error('Proxy internal error:', error);
    return response.status(500).json({ error: 'Internal Server Error in proxy' });
  }
}
