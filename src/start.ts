import { createStart } from '@tanstack/react-start'
import * as MdRouter from '#/lib/MdRouter'

export const startInstance = createStart(() => ({
  requestMiddleware: [MdRouter.middleware],
}))
