import { onRequest as __api___path___ts_onRequest } from "C:\\Users\\81806\\Documents\\programs\\couple-calendar\\functions\\api\\[[path]].ts"

export const routes = [
    {
      routePath: "/api/:path*",
      mountPath: "/api",
      method: "",
      middlewares: [],
      modules: [__api___path___ts_onRequest],
    },
  ]