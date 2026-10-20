import React, { useState, useEffect } from 'react';
import {
  Database,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Sparkles,
  ShieldCheck,
  Info,
  AlertTriangle,
} from 'lucide-react';
import { usePlanner } from '../context/PlannerContext';
import { useModalKeyEvents } from '../hooks/useModalKeyEvents';
import {
  ALL_TABLE_NAMES,
  generateFullBackupPayload,
  downloadBackupFile,
  validateBackupPayload,
  executeBackupRestore,
  BackupPayload,
  BackupGenerationResult,
  RestoreResult,
  TableRestoreMetrics,
} from '../services/backupService';

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ isOpen, onClose }) => {
  const {
    trips,
    activeTripId,
    settings,
    expenses,
    itineraryDays,
    flights,
    accommodations,
    carRentals,
    parkTickets,
    prepDocuments,
    reloadFromSupabase,
    addNotification,
  } = usePlanner();

  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<BackupGenerationResult | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Import State
  const [fileContent, setFileContent] = useState<string>('');
  const [pastedJson, setPastedJson] = useState<string>('');
  const [importMode, setImportMode] = useState<'file' | 'text'>('file');
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    payload?: BackupPayload;
    error?: string;
    summary?: { tableCount: number; recordCount: number; tableDetails: Record<string, number> };
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);

  // Generate payload preview when opening export tab
  useEffect(() => {
    if (isOpen && activeTab === 'export') {
      setIsExporting(true);
      generateFullBackupPayload({
        trips,
        activeTripId,
        settings,
        expenses,
        itineraryDays,
        flights,
        accommodations,
        carRentals,
        parkTickets,
        prepDocuments,
      })
        .then((res) => {
          setExportResult(res);
        })
        .finally(() => setIsExporting(false));
    }
  }, [isOpen, activeTab, trips, activeTripId, settings, expenses, itineraryDays, flights, accommodations, carRentals, parkTickets, prepDocuments]);

  // Validate JSON whenever fileContent or pastedJson changes in import tab
  useEffect(() => {
    const raw = importMode === 'file' ? fileContent : pastedJson;
    if (raw && raw.trim().length > 0) {
      const res = validateBackupPayload(raw);
      setValidationResult(res);
      setRestoreResult(null);
    } else {
      setValidationResult(null);
      setRestoreResult(null);
    }
  }, [fileContent, pastedJson, importMode]);

  const handleDownloadBackup = async () => {
    setIsExporting(true);
    try {
      const res = exportResult || (await generateFullBackupPayload({
        trips,
        activeTripId,
        settings,
        expenses,
        itineraryDays,
        flights,
        accommodations,
        carRentals,
        parkTickets,
        prepDocuments,
      }));

      setExportResult(res);

      if (!res.success || !res.payload) {
        alert('Não foi possível gerar um backup completo devido a falhas em paginação ou consultas. Verifique os erros listados antes de exportar.');
        return;
      }

      downloadBackupFile(res.payload);
      addNotification('Download do backup completo realizado com sucesso!');
    } catch (err) {
      console.error('Erro ao baixar backup:', err);
      alert('Erro inesperado ao gerar backup.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyJson = () => {
    if (!exportResult || !exportResult.success || !exportResult.payload) {
      alert('O backup possui falhas e não pode ser copiado como completo.');
      return;
    }
    const str = JSON.stringify(exportResult.payload, null, 2);
    navigator.clipboard.writeText(str);
    setCopiedJson(true);
    addNotification('Backup JSON copiado para a área de transferência!');
    setTimeout(() => setCopiedJson(false), 2500);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setFileContent(text || '');
    };
    reader.readAsText(file);
  };

  const handleExecuteRestore = async () => {
    if (!validationResult || !validationResult.valid || !validationResult.payload) return;

    setIsRestoring(true);
    setRestoreResult(null);

    try {
      const res = await executeBackupRestore(validationResult.payload);
      setRestoreResult(res);

      if (res.success) {
        addNotification('Backup restaurado integralmente com sucesso!');
        await reloadFromSupabase();
      } else if (res.isPartial) {
        addNotification('Aviso: Restauração parcial concluída com omissões ou falhas.', 'warning');
        await reloadFromSupabase();
      } else {
        addNotification('Erro ao restaurar o backup. Nenhum dado válido foi gravado.', 'error');
      }
    } catch (err: any) {
      alert(`Erro inesperado na restauração: ${err?.message || err}`);
    } finally {
      setIsRestoring(false);
    }
  };

  const { handleBackdropClick } = useModalKeyEvents({
    isOpen,
    onCancel: onClose,
  });

  if (!isOpen) return null;

  return (
    <div
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-hidden animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-4xl h-[88vh] max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="bg-[#1A2B4C] text-white p-5 sm:p-6 flex items-center justify-between border-b border-[#D4AF37]/30 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37] shrink-0">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[#D4AF37] block">
                Gerenciamento &amp; Segurança Rigorosa • 19 Tabelas Supabase
              </span>
              <h2 className="text-base sm:text-xl font-bold font-serif text-white tracking-tight">
                Backup &amp; Restauração com Verificação de Integridade
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 bg-slate-100/80 border-b border-slate-200 shrink-0">
          <button
            onClick={() => setActiveTab('export')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'export'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>1. Criar &amp; Baixar Backup</span>
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'import'
                ? 'border-[#1A2B4C] text-[#1A2B4C] bg-white rounded-t-xl shadow-2xs'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4 text-blue-600" />
            <span>2. Ler &amp; Restaurar Backup</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar p-6 space-y-6">
          {/* TAB 1: EXPORT / CREATE BACKUP */}
          {activeTab === 'export' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-950 leading-relaxed">
                  <span className="font-bold block text-emerald-900 mb-0.5">
                    Exportação Validada com Paginação Estável
                  </span>
                  O sistema utiliza paginação estável (blocos de 1000 registros) para ler todas as linhas de cada tabela. O download só é liberado quando todas as páginas de todas as 19 tabelas são concluídas sem erros.
                </div>
              </div>

              {/* Export Status Banner */}
              {exportResult && (
                <div
                  className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    exportResult.success
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : 'bg-rose-50 border-rose-300 text-rose-950'
                  }`}
                >
                  {exportResult.success ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 text-xs">
                    <span className="font-bold block">
                      {exportResult.success
                        ? `Backup pronto! Todas as 19 tabelas foram exportadas com sucesso (${exportResult.totalRecords} registros totais).`
                        : `Atenção: Falha ao exportar ${exportResult.failedTables.length} tabela(s). Este backup NÃO é considerado completo.`}
                    </span>
                    {!exportResult.success && (
                      <div className="pt-1 space-y-1 text-[11px] text-rose-800">
                        {Object.entries(exportResult.tableErrors).map(([tbl, err]) => (
                          <div key={tbl} className="font-mono">
                            • <strong>{tbl}</strong>: {err}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownloadBackup}
                  disabled={isExporting}
                  className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Lendo Tabelas (Paginação)...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Baixar Arquivo JSON de Backup</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleCopyJson}
                  disabled={!exportResult?.success}
                  className="w-full sm:w-auto px-5 py-3.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-slate-500" />
                      <span>Copiar JSON em Texto</span>
                    </>
                  )}
                </button>
              </div>

              {/* Live Tables Summary Table */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                  <span>Status &amp; Contagem por Tabela</span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                    {ALL_TABLE_NAMES.length} Tabelas Totais
                  </span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-64 overflow-y-auto p-1">
                  {ALL_TABLE_NAMES.map((name) => {
                    const count = exportResult?.tableCounts?.[name] ?? 0;
                    const hasError = exportResult?.tableErrors?.[name];
                    return (
                      <div
                        key={name}
                        className={`p-2.5 rounded-xl text-xs flex items-center justify-between border shadow-2xs ${
                          hasError
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <span className="font-mono text-[11px] text-slate-800 block truncate">{name}</span>
                          {hasError && <span className="text-[9px] text-rose-600 block">Falha na consulta</span>}
                        </div>
                        <span
                          className={`font-bold text-[11px] px-2 py-0.5 rounded-md border shrink-0 ${
                            hasError
                              ? 'bg-rose-100 text-rose-800 border-rose-300'
                              : 'bg-white text-[#1A2B4C] border-slate-200'
                          }`}
                        >
                          {hasError ? 'Erro' : count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: IMPORT / RESTORE BACKUP */}
          {activeTab === 'import' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-950 leading-relaxed">
                  <span className="font-bold block text-blue-900 mb-0.5">
                    Validação Pré-Gravação &amp; Verificação em Blocos (Chunks)
                  </span>
                  O arquivo é validado (appName, backupVersion v2.0 e tabelas) <strong>antes</strong> de qualquer gravação. A verificação de IDs no Supabase utiliza blocos seguros de 200 IDs para evitar limites de URL.
                </div>
              </div>

              {/* Mode Toggle */}
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setImportMode('file')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    importMode === 'file'
                      ? 'bg-white text-[#1A2B4C] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📁 Enviar Arquivo (.json)
                </button>
                <button
                  type="button"
                  onClick={() => setImportMode('text')}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    importMode === 'text'
                      ? 'bg-white text-[#1A2B4C] shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📝 Colar Texto JSON
                </button>
              </div>

              {/* File Upload Zone */}
              {importMode === 'file' && (
                <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#D4AF37] bg-slate-50 transition-colors text-center space-y-3">
                  <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                  <div>
                    <label className="px-4 py-2 bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-xs rounded-xl shadow-2xs cursor-pointer inline-flex items-center gap-2">
                      <span>Selecionar Arquivo JSON</span>
                      <input
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Formatos suportados: backup_kingdomcompass_*.json
                  </p>
                </div>
              )}

              {/* Text Input Area */}
              {importMode === 'text' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Cole o JSON do Backup:</label>
                  <textarea
                    rows={6}
                    value={pastedJson}
                    onChange={(e) => setPastedJson(e.target.value)}
                    placeholder='Cole aqui o conteúdo JSON do backup {"appName": "KingdomCompass", "tables": {...}}'
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-[#1A2B4C] outline-hidden"
                  />
                </div>
              )}

              {/* Validation Feedback & Preview */}
              {validationResult && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 animate-in fade-in duration-150 ${
                    validationResult.valid
                      ? 'bg-emerald-50/80 border-emerald-300'
                      : 'bg-rose-50/80 border-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {validationResult.valid ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="font-bold text-emerald-900 text-xs">
                          Arquivo Válido! Encontradas {validationResult.summary?.tableCount} tabelas com {validationResult.summary?.recordCount} registros.
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600" />
                        <span className="font-bold text-rose-900 text-xs">
                          {validationResult.error || 'Formato de arquivo incompatível.'}
                        </span>
                      </>
                    )}
                  </div>

                  {validationResult.valid && validationResult.summary && (
                    <div className="pt-2 border-t border-emerald-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                      {Object.entries(validationResult.summary.tableDetails).map(([tbl, cnt]) => (
                        <div key={tbl} className="bg-white/80 p-2 rounded-lg border border-emerald-200 flex justify-between">
                          <span className="font-mono text-slate-700 truncate">{tbl}</span>
                          <span className="font-bold text-emerald-800">{cnt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Restoration Result Metrics & Status */}
              {restoreResult && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 animate-in zoom-in-95 ${
                    restoreResult.success
                      ? 'bg-emerald-50 border-emerald-300'
                      : restoreResult.isPartial
                      ? 'bg-amber-50 border-amber-300'
                      : 'bg-rose-50 border-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {restoreResult.success ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span className="font-bold text-emerald-950 text-xs">
                          Restauração Concluída com Sucesso! ({restoreResult.totalVerified} registros verificados).
                        </span>
                      </>
                    ) : restoreResult.isPartial ? (
                      <>
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <span className="font-bold text-amber-950 text-xs">
                          Restauração Parcial: {restoreResult.totalRestored} registros restaurados, mas houve falhas ou omissões em {restoreResult.failedTables.length} tabela(s).
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-5 h-5 text-rose-600" />
                        <span className="font-bold text-rose-950 text-xs">
                          Falha na Restauração: Nenhum registro foi restaurado ou arquivo incompatível. Veja os detalhes abaixo.
                        </span>
                      </>
                    )}
                  </div>

                  {/* Complete 19-table report */}
                  <div className="pt-2 border-t border-slate-200 space-y-2 max-h-64 overflow-y-auto">
                    {(Object.entries(restoreResult.tableMetrics) as [string, TableRestoreMetrics][]).map(([tbl, metrics]) => {
                      const isRestored = metrics.status === 'restored';
                      const isEmpty = metrics.status === 'empty';
                      const isMissing = metrics.status === 'missing_in_file';

                      return (
                        <div
                          key={tbl}
                          className={`p-2.5 rounded-xl text-xs flex items-center justify-between border ${
                            isRestored
                              ? 'bg-white border-emerald-200 text-emerald-950 shadow-2xs'
                              : isEmpty
                              ? 'bg-slate-50 border-slate-200 text-slate-700'
                              : 'bg-rose-50 border-rose-200 text-rose-950'
                          }`}
                        >
                          <div className="font-mono truncate pr-2">
                            <span className="font-bold">{tbl}</span>
                            {metrics.error && <span className="block text-[10px] text-rose-600">{metrics.error}</span>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[11px]">
                            {isMissing ? (
                              <span className="text-rose-600 font-bold">Ausente no arquivo</span>
                            ) : isEmpty ? (
                              <span className="text-slate-500 font-semibold">Tabela vazia (0)</span>
                            ) : (
                              <>
                                <span title="Quantidade Esperada">Esperado: <strong>{metrics.expectedCount}</strong></span>
                                <span title="Quantidade Gravada">Gravado: <strong>{metrics.writtenCount}</strong></span>
                                <span title="Quantidade Confirmada no Supabase">Verificado: <strong className="text-emerald-700">{metrics.verifiedCount}</strong></span>
                              </>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                                isRestored
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : isEmpty
                                  ? 'bg-slate-200 text-slate-700'
                                  : isMissing
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isRestored ? 'Sucesso' : isEmpty ? 'Vazia' : isMissing ? 'Ausente' : 'Falha'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Restore Action Button */}
              {validationResult?.valid && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleExecuteRestore}
                    disabled={isRestoring}
                    className="w-full py-3.5 rounded-xl bg-[#1A2B4C] hover:bg-[#2A437E] text-white font-bold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Restaurando &amp; Verificando em Blocos...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />
                        <span>Confirmar &amp; Restaurar Backup no Sistema</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500 font-medium">
            Segurança Rigorosa: validação pré-gravação, chunks de IDs e relatório completo por tabela.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
