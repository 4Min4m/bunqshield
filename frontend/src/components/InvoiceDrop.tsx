import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'

interface Props {
  onFile: (file: File) => void
  disabled?: boolean
}

export function InvoiceDrop({ onFile, disabled }: Props) {
  const [preview, setPreview] = useState<{ url: string; name: string; size: string } | null>(null)

  const onDrop = useCallback((accepted: File[]) => {
    const file = accepted[0]
    if (!file) return
    setPreview({
      url: URL.createObjectURL(file),
      name: file.name,
      size: `${(file.size / 1024).toFixed(1)} KB`,
    })
    onFile(file)
  }, [onFile])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': [] },
    maxFiles: 1,
    disabled,
  })

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-blue-500/60 hover:bg-white/5'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        <div className="text-4xl mb-3">📄</div>
        {isDragActive ? (
          <p className="text-blue-400 font-medium">Drop invoice here...</p>
        ) : (
          <>
            <p className="text-slate-300 font-medium">Drag & drop invoice image</p>
            <p className="text-muted text-sm mt-1">or click to browse</p>
            <p className="text-muted text-xs mt-3">PNG, JPG supported · Max 20MB</p>
          </>
        )}
      </div>

      {preview && (
        <div className="flex items-center gap-4 bg-card border border-border rounded-xl p-3">
          <img src={preview.url} alt="Preview" className="h-16 w-16 object-cover rounded-lg" />
          <div>
            <p className="text-sm font-medium text-slate-200">{preview.name}</p>
            <p className="text-xs text-muted">{preview.size}</p>
          </div>
        </div>
      )}
    </div>
  )
}
