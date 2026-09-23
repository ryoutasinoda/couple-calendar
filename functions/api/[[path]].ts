// functions/api/[[path]].ts
export const onRequest: PagesFunction = async (context) => {
  const incomingUrl = new URL(context.request.url)
  const targetUrl = `https://couple-calendar-api.couple-calendar-81806.workers.dev${incomingUrl.pathname}${incomingUrl.search}`

  const method = context.request.method
  const hasBody = method !== 'GET' && method !== 'HEAD'

  const forwardedRequest = new Request(targetUrl, {
    method,
    headers: context.request.headers,
    body: hasBody ? await context.request.arrayBuffer() : undefined,
  })

  // Workerへそのまま転送
  const workerResponse = await fetch(forwardedRequest)

  // Set-Cookie等のヘッダーを含めてそのままブラウザへ返す
  // → ブラウザから見るとリクエスト先は常に自分のドメイン(pages.dev)なので
  //   Cookieはfirst-party扱いになり、SafariのITPの対象外になる
  return new Response(workerResponse.body, {
    status: workerResponse.status,
    headers: workerResponse.headers,
  })
}