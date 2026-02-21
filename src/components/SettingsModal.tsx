import { useState, useEffect } from 'react'

interface SettingsProps {
    isOpen: boolean
    onClose: () => void
}

export function SettingsModal({ isOpen, onClose }: SettingsProps) {
    const [memory, setMemory] = useState("4G")
    const [javaPath, setJavaPath] = useState("")

    useEffect(() => {
        const savedMem = localStorage.getItem("launcher_memory")
        const savedJava = localStorage.getItem("launcher_java")
        if (savedMem) setMemory(savedMem)
        if (savedJava) setJavaPath(savedJava)
    }, [isOpen])

    const handleSave = () => {
        localStorage.setItem("launcher_memory", memory)
        localStorage.setItem("launcher_java", javaPath)
        onClose()
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg w-full max-w-md border border-gray-700">
                <h2 className="text-2xl font-bold mb-4 text-emerald-500">Configurações</h2>

                <div className="mb-4">
                    <label className="block text-gray-400 mb-2">Memória Máxima (RAM)</label>
                    <input
                        type="text"
                        value={memory}
                        onChange={(e) => setMemory(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-emerald-500 outline-none"
                        placeholder="Ex: 4G or 4096M"
                    />
                    <p className="text-xs text-gray-500 mt-1">Exemplo: 4G ou 4096M</p>
                </div>

                <div className="mb-6">
                    <label className="block text-gray-400 mb-2">Caminho do Java (Opcional)</label>
                    <input
                        type="text"
                        value={javaPath}
                        onChange={(e) => setJavaPath(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white focus:border-emerald-500 outline-none"
                        placeholder="Caminho para javaw.exe"
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded text-white font-bold"
                    >
                        Salvar
                    </button>
                </div>
            </div>
        </div>
    )
}
