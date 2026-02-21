import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './App.css'
import { SettingsModal } from './components/SettingsModal'

function App() {
  const [profile, setProfile] = useState<any>(null)
  const [authToken, setAuthToken] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Offline-only mode
  const [username, setUsername] = useState(localStorage.getItem("launcher_username") || 'Steve')

  const [launching, setLaunching] = useState(false)
  const [progress, setProgress] = useState<any>(null)
  const [gameLog, setGameLog] = useState<string | null>(null)


  const [isSettingsOpen, setSettingsOpen] = useState(false)

  // Skin URL - using minotar for reliable 2D body renders
  const skinUrl = `https://minotar.net/body/${username || 'Steve'}/150.png`

  useEffect(() => {
    // Listen for game events
    const progressHandler = (_event: any, data: any) => {
      setProgress(data)
    }
    const logHandler = (_event: any, data: string) => {
      setGameLog(data)
    }
    const closeHandler = (_event: any, code: any) => {
      setLaunching(false)
      setGameLog(null)
      console.log("Game closed", code)
    }

    if (window.ipcRenderer) {
      window.ipcRenderer.on('game:progress', progressHandler)
      window.ipcRenderer.on('game:log', logHandler)
      window.ipcRenderer.on('game:close', closeHandler)
    }

    return () => {
      if (window.ipcRenderer) {
        window.ipcRenderer.off('game:progress', progressHandler)
        window.ipcRenderer.off('game:log', logHandler)
        window.ipcRenderer.off('game:close', closeHandler)
      }
    }
  }, [])

  const handleLogin = async () => {
    if (!username.trim()) return
    setLoading(true)
    setError(null)
    try {
      // Always offline auth
      const result = await window.ipcRenderer.invoke('auth:login', {
        mode: 'offline',
        username: username
      })
      if (result.success) {
        setProfile(result.profile)
        setAuthToken(result.token)
        localStorage.setItem("launcher_username", username)
      } else {
        setError(result.error)
      }
    } catch (e) {
      setError("Failed to login: " + String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleLaunch = async () => {
    if (!authToken) return
    setLaunching(true)
    setError(null)

    const javaPath = localStorage.getItem("launcher_java")
    const memory = localStorage.getItem("launcher_memory")

    try {
      const result = await window.ipcRenderer.invoke('game:launch', {
        auth: authToken,
        javaPath: javaPath || undefined,
        memory: memory || "4G"
      })
      if (!result.success) {
        setError(result.error)
        setLaunching(false)
      }
    } catch (e) {
      setError("Launch failed: " + String(e))
      setLaunching(false)
    }
  }

  const handleLogout = () => {
    setProfile(null)
    setAuthToken(null)
    setProgress(null)
  }

  return (
    <div className="min-h-screen text-white flex flex-col items-center justify-center p-4 relative overflow-hidden bg-gray-900 selection:bg-pink-500 selection:text-white">

      {/* Dynamic Animated Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {/* Landscape Background */}
        <video
          autoPlay
          loop
          muted
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        >
          <source src="background.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"></div>
      </div>

      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-yellow-400 hover:text-white transition-all hover:rotate-90 duration-500 p-2 transform hover:scale-110 drop-shadow-lg"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
            <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.922-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.45-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
          </svg>
        </button>
      </div>



      <AnimatePresence mode="wait">
        {profile ? (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center z-10 w-full max-w-5xl"
          >
            <div className="flex flex-col md:flex-row items-center gap-16 mb-12 w-full justify-center">
              {/* Profile Card */}
              <motion.div
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="group relative bg-white/5 backdrop-blur-xl p-8 rounded-3xl border border-white/10 flex flex-col items-center hover:bg-white/10 transition-all duration-300 shadow-2xl"
              >
                <div className="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-cyan-600 rounded-3xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 pointer-events-none"></div>
                <div className="relative z-10">
                  <img
                    src={`https://minotar.net/body/${profile.name}/150.png`}
                    alt="Skin"
                    className="h-48 drop-shadow-2xl transform group-hover:scale-110 transition-transform duration-300"
                  />
                </div>
                <h2 className="text-3xl font-bold mt-6 text-white text-shadow-lg relative z-10">{profile.name}</h2>
                <button
                  onClick={handleLogout}
                  disabled={launching}
                  className="mt-4 px-4 py-1 text-xs font-bold text-white/50 hover:text-white bg-white/5 hover:bg-red-500/20 rounded-full transition-all uppercase tracking-widest border border-white/5 hover:border-red-500/50 relative z-10"
                >
                  Trocar Conta
                </button>
              </motion.div>

              {/* Action Area */}
              <div className="flex flex-col items-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLaunch}
                  disabled={launching}
                  className="group relative px-20 py-8 bg-gradient-to-br from-emerald-500 to-teal-400 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed rounded-3xl font-black text-4xl text-white shadow-[0_20px_50px_rgba(16,185,129,0.3)] transition-all overflow-hidden border border-white/20"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                  <span className="relative drop-shadow-md">
                    {launching ? 'INICIANDO...' : 'JOGAR'}
                  </span>
                </motion.button>
              </div>
            </div>

            {/* Console / Status */}
            {launching && (
              <motion.div
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-2xl bg-black/60 backdrop-blur-xl p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col relative overflow-hidden"
              >
                {progress && (
                  <div className="relative z-10 w-full">
                    <div className="flex justify-between text-xs text-emerald-300 font-bold font-mono mb-2 uppercase tracking-wide">
                      <span>{progress.type || 'CARREGANDO...'}</span>
                      <span>{Math.round((progress.task / progress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-white/10 rounded-full h-4 overflow-hidden relative">
                      <motion.div
                        layoutId="progressBar"
                        className="bg-gradient-to-r from-emerald-500 to-cyan-400 h-full shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${(progress.task / progress.total) * 100}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.5 }}
                      ></motion.div>
                    </div>
                  </div>
                )}

                {/* Game Log Output */}
                {gameLog && (
                  <div className="mt-4 p-3 bg-black/40 rounded-lg border border-white/5 font-mono text-xs text-blue-200/80 truncate">
                    <span className="text-emerald-500 mr-2">➜</span>
                    {gameLog}
                  </div>
                )}

              </motion.div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6 bg-red-500/20 backdrop-blur-md text-red-100 px-6 py-4 rounded-xl border border-red-500/30 shadow-lg flex items-center gap-3"
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.9, rotateX: 20 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, scale: 0.9, rotateX: -20 }}
            transition={{ type: "spring", duration: 0.6 }}
            className="group relative mt-24 bg-gray-900/60 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-md z-10 flex flex-col items-center"
          >
            {/* Glossy Reflection overlay */}
            <div className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/5 to-transparent rounded-t-[2.5rem] pointer-events-none"></div>

            {/* Skin Preview in Login */}
            <div className="mb-8 relative w-40 h-40 flex items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-tr from-yellow-400 to-red-500 blur-[50px] opacity-20 group-hover:opacity-40 transition-opacity duration-1000"></div>
              <div className="relative z-10 transition-transform duration-500 group-hover:-translate-y-2">
                <img
                  src={skinUrl}
                  alt="Skin Preview"
                  className="h-40 drop-shadow-[0_15px_15px_rgba(0,0,0,0.5)] filter contrast-125"
                  onError={(e) => { e.currentTarget.src = 'https://minotar.net/body/Steve/150.png' }}
                />
              </div>
            </div>

            <div className="w-full mb-8 space-y-2">
              <label className="text-xs font-bold text-emerald-400 pl-4 uppercase tracking-[0.2em] opacity-80">Nome do Treinador</label>
              <div className="relative">
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="peer w-full bg-black/40 border border-white/10 rounded-2xl py-4 px-6 text-white text-xl font-bold focus:border-emerald-500 focus:bg-black/60 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all placeholder-white/20 text-center shadow-inner"
                  placeholder="Steve"
                />
                <div className="absolute bottom-0 left-6 right-6 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent transform scale-x-0 peer-focus:scale-x-100 transition-transform duration-500"></div>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.05, boxShadow: "0 10px 30px -10px rgba(16, 185, 129, 0.5)" }}
              whileTap={{ scale: 0.95 }}
              onClick={handleLogin}
              disabled={loading || !username.trim()}
              className="w-full py-5 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:from-gray-700 disabled:to-gray-800 disabled:cursor-not-allowed rounded-2xl font-black text-xl text-white shadow-xl transition-all relative overflow-hidden group/btn"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover/btn:translate-y-0 transition-transform duration-300 skew-y-12"></div>
              <span className="relative flex items-center justify-center gap-3">
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    CONECTANDO...
                  </>
                ) : 'ENTRAR NO MUNDO'}
              </span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

export default App
