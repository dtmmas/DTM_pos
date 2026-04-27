import { create } from 'zustand'
import { api } from '../api'

interface Config {
  name: string
  logoUrl?: string
  currency: string
}

interface ConfigState {
  config?: Config
  fetchConfig: () => Promise<void>
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: undefined,
  async fetchConfig() {
    try {
      const { data } = await api.get('/config')
      const logoUrl = data?.logoUrl && String(data.logoUrl).trim() ? data.logoUrl : 'https://placehold.co/64x64?text=LOGO'
      set({ config: { ...data, logoUrl } })
    } catch {
      set({ config: { name: 'DTMPos', currency: 'USD', logoUrl: 'https://placehold.co/64x64?text=LOGO' } })
    }
  },
}))