import { createStart } from '@tanstack/react-start'
import { middleware as mdRouter } from '#/lib/MdRouter'

export const startInstance = createStart(() => ({
  requestMiddleware: [mdRouter],
}))
