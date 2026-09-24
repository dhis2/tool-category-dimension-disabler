import path from 'node:path'
import { defineConfig, ConfigEnv } from 'vite'

const viteConfig = defineConfig(async (configEnv: ConfigEnv) => {
    const { mode } = configEnv
    return {
        clearScreen: mode !== 'development',
        resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
    }
})

export default viteConfig
