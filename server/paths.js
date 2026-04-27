import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
export const serverDir = path.dirname(__filename)
export const projectRoot = path.resolve(serverDir, '..')
export const uploadsDir = path.join(serverDir, 'uploads')
export const dataDir = path.join(serverDir, 'data')
export const envPath = path.join(serverDir, '.env')
