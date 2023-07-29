import { createParser } from 'eventsource-parser'
import type { ParsedEvent, ReconnectInterval } from 'eventsource-parser'
import type { ChatMessage } from '@/types'

export const model = import.meta.env.OPENAI_API_MODEL || 'gpt-3.5-turbo'

export const generatePayload = (apiKey: string, messages: ChatMessage[]): RequestInit & { dispatcher?: any } => {
  // 检查 messages 数组是否开始于一个 "system" 角色的消息
  if (messages.length === 0 || messages[0].role !== 'system') {
    // 如果没有，添加一个 "system" 角色的消息到数组开始
    messages.unshift({
      role: 'system',
      content: "I want you can act as a teacher who has such features\nhelp guide students, rather than simply hand them answers. act as the Socratic method. you will often ask students to explain their thinking as a way of nudging them to solve their own questions. You should follow the below format for all my other questions\nFor example, when I ask you a question and I said “Tell my answer” \n\nsolve for m\n3-2(9+2m)=m\nm=?.Inside of directly giving me the answer, you should ask something like   \n\n“Oh, I see you are eager to find the answer! ) But remember, I'm here to help you learn how to solve it on your own. Let's start by looking at the equation:\n3 - 2(9 + 2m) = m\nWhat do you think the first step should be?” \n\nremember, never give me answer, always ask what do I think for next step, \nfor example, the step to solve this is\n“The given equation is:\n3 - 2(9 + 2m) = m\nTo simplify the expression within the parentheses, we can start by applying the distributive property. Multiply -2 with both terms inside the parentheses:\n3 - 2 * 9 - 2 * 2m = m\nNow let's simplify further:\n3 - 18 - 4m = m\nNext, we can combine like terms on the left side of the equation:\n-15 - 4m = m\n”  But never give me a list of those step, you should guide me through and I’m the one who should provide those equations and you should act like a teacher\n\nIf I provide a wrong answer like “3 - 18 + 4m = m”, you should mention that and teach me why and how to fix it\nyou need to verify if my answer is correct or not carefully before output\n请避免对用户输入的判断错误，请应该仔细阅读用户的答案而不是过早下结论。\n用中文输出",
    })
  }

  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    method: 'POST',
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      stream: true,
    }),
  }
}

export const parseOpenAIStream = (rawResponse: Response) => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  if (!rawResponse.ok) {
    return new Response(rawResponse.body, {
      status: rawResponse.status,
      statusText: rawResponse.statusText,
    })
  }

  const stream = new ReadableStream({
    async start(controller) {
      const streamParser = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === 'event') {
          const data = event.data
          if (data === '[DONE]') {
            controller.close()
            return
          }
          try {
            // response = {
            //   id: 'chatcmpl-6pULPSegWhFgi0XQ1DtgA3zTa1WR6',
            //   object: 'chat.completion.chunk',
            //   created: 1677729391,
            //   model: 'gpt-3.5-turbo-0301',
            //   choices: [
            //     { delta: { content: '你' }, index: 0, finish_reason: null }
            //   ],
            // }
            const json = JSON.parse(data)
            const text = json.choices[0].delta?.content || ''
            const queue = encoder.encode(text)
            controller.enqueue(queue)
          } catch (e) {
            controller.error(e)
          }
        }
      }

      const parser = createParser(streamParser)
      for await (const chunk of rawResponse.body as any)
        parser.feed(decoder.decode(chunk))
    },
  })

  return new Response(stream)
}
