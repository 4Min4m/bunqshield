import { useEffect, useState } from 'react'
import { useStore } from './store'
import { DemoModeBanner } from './components/DemoModeBanner'
import { InvoiceDrop } from './components/InvoiceDrop'
import { DemoScenarioPicker } from './components/DemoScenarioPicker'
import { AnalysisProgress } from './components/AnalysisProgress'
import { FraudScoreMeter } from './components/FraudScoreMeter'
import { RiskBadge } from './components/RiskBadge'
import { HeatmapOverlay } from './components/HeatmapOverlay'
import { AnalysisBreakdown } from './components/AnalysisBreakdown'
import { AgentChat } from './components/AgentChat'
import { PaymentsTable } from './components/PaymentsTable'

type Tab = 'analysis' | 'payments'

export default function App() {
  const {
    appState, demoMode, currentReport, payments,
    checkDemoMode, uploadInvoice, loadPayments, setAppState,
  } = useStore()

  const [tab, setTab] = useState<Tab>('analysis')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  useEffect(() => {
    void checkDemoMode()
  }, [checkDemoMode])

  useEffect(() => {
    if (tab === 'payments') void loadPayments()
  }, [tab, loadPayments])

  const handleFile = (file: File) => setSelectedFile(file)

  const handleAnalyze = () => {
    if (selectedFile) void uploadInvoice(selectedFile)
  }

  const handleDemoScenario = (id: string) => {
    void uploadInvoice(new File([], 'demo.png', { type: 'image/png' }), id)
  }

  const isAnalyzing = appState === 'uploading' || appState === 'analyzing'
  const hasResult = appState === 'result_clean' || appState === 'result_warning' || appState === 'result_blocked'

  return (
    <div className="min-h-screen bg-base text-slate-100 font-sans">
      {demoMode && <DemoModeBanner />}

      <div className={demoMode ? 'pt-10' : ''}>
        {/* Header */}
        <header className="border-b border-border px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-lg">🛡</div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">BunqShield</h1>
                <p className="text-xs text-muted">AI Invoice Fraud Detection</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted px-2 py-1 rounded-full border border-border">
                bunq sandbox
              </span>
            </div>
          </div>
        </header>

        {/* Tabs */}
        <div className="border-b border-border px-6">
          <div className="max-w-6xl mx-auto flex gap-6">
            {(['analysis', 'payments'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors capitalize
                  ${tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-muted hover:text-slate-300'}`}
              >
                {t === 'analysis' ? 'Invoice Analysis' : 'Payments Dashboard'}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <main className="max-w-6xl mx-auto px-6 py-8">
          {tab === 'analysis' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left: Upload */}
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Analyze Invoice</h2>
                  <p className="text-muted text-sm">Upload an invoice image to detect fraud using AI</p>
                </div>

                <InvoiceDrop onFile={handleFile} disabled={isAnalyzing} />

                {selectedFile && !isAnalyzing && !hasResult && (
                  <button
                    onClick={handleAnalyze}
                    className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 font-semibold transition-colors"
                  >
                    Analyze Invoice
                  </button>
                )}

                {hasResult && (
                  <button
                    onClick={() => { setAppState('idle'); setSelectedFile(null) }}
                    className="w-full py-3 rounded-xl bg-card border border-border hover:bg-white/5 font-medium transition-colors text-muted"
                  >
                    ← Analyze Another Invoice
                  </button>
                )}

                <DemoScenarioPicker onSelect={handleDemoScenario} disabled={isAnalyzing} />
              </div>

              {/* Right: Results */}
              <div className="space-y-6">
                {appState === 'idle' && (
                  <div className="bg-card border border-border rounded-xl p-8 text-center text-muted">
                    <div className="text-5xl mb-4">🔍</div>
                    <p className="font-medium">Upload an invoice or select a demo scenario</p>
                    <p className="text-sm mt-1">Results will appear here</p>
                  </div>
                )}

                {isAnalyzing && <AnalysisProgress currentStep="cv" />}

                {hasResult && currentReport && (
                  <div className="space-y-6">
                    {/* Score + Badge */}
                    <div className="bg-card border border-border rounded-xl p-6 flex flex-col items-center gap-4">
                      <FraudScoreMeter score={currentReport.fused_score} riskLevel={currentReport.risk_level} />
                      <RiskBadge riskLevel={currentReport.risk_level} decision={currentReport.agent_decision} />
                      <p className="text-xs text-muted">
                        Processed in {currentReport.processing_time_ms.toFixed(0)}ms
                        {currentReport.demo_mode && ' · Demo mode'}
                      </p>
                    </div>

                    {/* Heatmap */}
                    {currentReport.vit_result?.heatmap_base64 && (
                      <div className="bg-card border border-border rounded-xl p-4">
                        <HeatmapOverlay
                          invoiceBase64={currentReport.vit_result.heatmap_base64}
                          heatmapBase64={currentReport.vit_result.heatmap_base64}
                          suspiciousRegions={currentReport.cv_results.flatMap(r => r.suspicious_regions)}
                        />
                      </div>
                    )}

                    {/* CV Breakdown */}
                    <div className="bg-card border border-border rounded-xl p-4">
                      <AnalysisBreakdown cvResults={currentReport.cv_results} />
                    </div>

                    {/* Agent */}
                    <div className="bg-card border border-border rounded-xl p-4">
                      <AgentChat reasoning={currentReport.agent_reasoning} decision={currentReport.agent_decision} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'payments' && (
            <PaymentsTable
              payments={payments}
              onAnalyze={(id) => console.log('analyze payment', id)}
              onRefresh={() => void loadPayments()}
            />
          )}
        </main>
      </div>
    </div>
  )
}
