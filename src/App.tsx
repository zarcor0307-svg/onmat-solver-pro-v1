/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Terminal, 
  Upload, 
  Play, 
  Copy, 
  Check, 
  AlertCircle, 
  FileCode, 
  Image as ImageIcon,
  Loader2,
  X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface AnalysisResult {
  explanation: string;
  script: string;
}

export default function App() {
  const [inputMode, setInputMode] = useState<'html' | 'image'>('html');
  const [htmlContent, setHtmlContent] = useState('');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [needsKeySelection, setNeedsKeySelection] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Handlers ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newFiles = [...imageFiles, ...files];
      setImageFiles(newFiles);
      
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      const newFiles = [...imageFiles, ...files];
      setImageFiles(newFiles);
      
      files.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImagePreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
      setInputMode('image');
    }
  };

  const removeImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearImages = () => {
    setImageFiles([]);
    setImagePreviews([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const analyzeContent = async () => {
    if (inputMode === 'html' && !htmlContent.trim()) {
      setError('Por favor, pega el contenido HTML de Onmat.');
      return;
    }
    if (inputMode === 'image' && imageFiles.length === 0) {
      setError('Por favor, sube al menos una captura de pantalla de Onmat.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const systemInstruction = `
        Actúa como "El Validador Matemático Crítico", un experto de nivel mundial en Matemáticas, Lógica y Automatización Web.
        Tu misión es resolver ejercicios de la plataforma "Onmat" aplicando un Razonamiento Matemático Integral (no solo visual).

        INSTRUCCIONES DE SISTEMA:
        1. FASE DE ESCANEO VISUAL: Identifica ejes, tramos de línea, puntos rellenos/vacíos y etiquetas.
        2. AJUSTE DE REJILLA (GRID-SNAPPING): Los puntos clave (cortes, máximos, mínimos) siempre se diseñan sobre la cuadrícula principal. Si un punto está cerca de un múltiplo de 10 o 20, es exactamente ese valor. Elimina valores "sucios" (ej: 95 si está pegado al 100).
        3. COHERENCIA DE SIGNOS: Si la línea toca el eje X y rebota, y=0. No inventes valores negativos si la gráfica no cruza claramente hacia abajo.
        4. VISIÓN 360° (GRÁFICOS + ÁLGEBRA + LÓGICA): Valida que los intervalos de crecimiento y puntos de corte tengan sentido matemático entre sí. Si un mínimo está en (100, 0), el crecimiento debe empezar en 100.
        5. REGLA DE ORO: Si los datos escritos por el usuario en la captura contradicen la lógica matemática o la tendencia de la gráfica, DEBES PRIORIZAR LA CORRECCIÓN MATEMÁTICA e ignorar los errores del usuario.
        6. FASE DE VERIFICACIÓN DE TRUNCAMIENTO: El dominio y recorrido (Recorregut) deben coincidir exactamente con el inicio y fin de la gráfica. Si el punto más bajo toca el eje X, el Recorregut empieza en 0.
        7. CRECIMIENTO/DECRECIMIENTO: Ajusta los intervalos para que coincidan con los números exactos de la rejilla.

        REQUISITOS DEL SCRIPT (INYECTOR):
        - Función autoejecutable (IIFE) asíncrona.
        - LIMPIEZA TOTAL: Antes de asignar, el script DEBE borrar el valor anterior: el.value = ''; o el.innerText = '';
        - SIMULACIÓN HUMANA Y EVENTOS: focus(), delay aleatorio (400-1200ms), asignar valor alineado a la rejilla, y disparar OBLIGATORIAMENTE 'input', 'change' y 'blur' con { bubbles: true }.
        - Búsqueda Silenciosa en Documento e IFRAMES.

        ESTRUCTURA DEL SCRIPT:
        (async function(){
          const vals = [...];
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          function getInp(doc) {
            try { return Array.from(doc.querySelectorAll('input:not([type="hidden"]), textarea, [contenteditable="true"], .mat-input-element, .mat-mdc-input-element, .form-control')); }
            catch(e) { return []; }
          }
          let all = getInp(document);
          document.querySelectorAll('iframe').forEach(f => {
            try { all = all.concat(getInp(f.contentDocument || f.contentWindow.document)); } catch(e) {}
          });
          for (let i = 0; i < all.length; i++) {
            if (i < vals.length) {
              const el = all[i];
              el.focus();
              // Limpieza total
              if (el.hasAttribute('contenteditable') || el.contentEditable === 'true') el.innerText = '';
              else el.value = '';
              await sleep(Math.random() * 800 + 400);
              // Asignación alineada
              if (el.hasAttribute('contenteditable') || el.contentEditable === 'true') el.innerText = vals[i];
              else el.value = vals[i];
              // Eventos obligatorios para validación
              ['input', 'change', 'blur'].forEach(t => el.dispatchEvent(new Event(t, { bubbles: true })));
            }
          }
          console.log('%c[Onmat Pro] Validador Crítico: ' + Math.min(all.length, vals.length) + ' campos corregidos y alineados.', 'color: #10b981; font-weight: bold;');
        })();

        FORMATO DE RESPUESTA (JSON):
        {
          "explanation": "### Análisis del Validador Crítico (Visión 360°)\\n1. **Escaneo Visual**: [Descripción]\\n2. **Razonamiento Integral**: [Lógica detectada]\\n\\n| Campo | Valor Detectado (Erróneo) | Valor Corregido (Alineado a Rejilla) |\\n|-------|---------------------------|------------------------------|\\n| ... | ... | ... |\\n\\n[Explicación pedagógica]",
          "script": "El código JavaScript puro listo para ejecutar."
        }
      `;

      let response;
      if (inputMode === 'image' && imagePreviews.length > 0) {
        const parts = [
          { text: "Analiza estas capturas de pantalla del MISMO ejercicio de Onmat y genera la solución completa. Combina la información de todas las imágenes (ej: enunciados de una, tablas de otra, gráficos de otra)." },
          ...imagePreviews.map((preview, idx) => ({
            inlineData: {
              data: preview.split(',')[1],
              mimeType: imageFiles[idx]?.type || 'image/png'
            }
          }))
        ];

        response = await ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: "application/json"
          }
        });
      } else {
        response = await ai.models.generateContent({
          model,
          contents: `Analiza este HTML de Onmat y genera la solución:\n\n${htmlContent}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json"
          }
        });
      }

      const text = response.text || '{}';
      const cleanJson = text.replace(/```json\n?|```/g, '').trim();
      const parsedResult = JSON.parse(cleanJson);
      
      // Clean up the script field in case the AI included markdown backticks inside the JSON string
      if (parsedResult.script) {
        let s = parsedResult.script;
        s = s.replace(/```javascript\n?|```js\n?|```\n?/g, '').trim();
        // If the AI accidentally returned a JSON object as a string in the script field
        if (s.startsWith('{') && s.endsWith('}')) {
          try {
            const inner = JSON.parse(s);
            if (inner.script) s = inner.script;
          } catch (e) {}
        }
        parsedResult.script = s;
      }
      
      setResult(parsedResult);
      console.log("Script generado:", parsedResult.script);
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes('Requested entity was not found') || JSON.stringify(err).includes('Requested entity was not found')) {
        setError('El modelo no fue encontrado o requiere una configuración de API Key específica. Por favor, selecciona tu API Key de un proyecto de pago.');
        setNeedsKeySelection(true);
      } else {
        setError(`Error al analizar: ${err.message || 'Error desconocido'}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleOpenKeySelection = async () => {
    try {
      await window.aistudio.openSelectKey();
      setNeedsKeySelection(false);
      setError(null);
    } catch (err) {
      console.error('Failed to open key selection:', err);
    }
  };

  const clearHtml = () => {
    setHtmlContent('');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Terminal className="text-black w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-xl tracking-tight text-white">Onmat Solver <span className="text-emerald-500">Pro</span></h1>
              <p className="text-[10px] uppercase tracking-widest text-white/40 font-mono">Automation Specialist v1.0</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-mono text-white/60 uppercase tracking-tighter">System Ready</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Input */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#151619] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Play className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-bold uppercase tracking-widest text-white/80">Entrada de Datos</span>
                </div>
                <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
                  <button 
                    onClick={() => setInputMode('html')}
                    className={cn(
                      "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                      inputMode === 'html' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    HTML
                  </button>
                  <button 
                    onClick={() => setInputMode('image')}
                    className={cn(
                      "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                      inputMode === 'image' ? "bg-emerald-500 text-black" : "text-white/40 hover:text-white/60"
                    )}
                  >
                    Captura
                  </button>
                </div>
              </div>

              <div className="p-6">
                {inputMode === 'html' ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-mono uppercase text-white/40 tracking-widest">Pega el código fuente de la página</label>
                      <button 
                        onClick={clearHtml}
                        className="text-[10px] font-mono uppercase text-white/20 hover:text-red-500 transition-colors"
                      >
                        Limpiar
                      </button>
                    </div>
                    <textarea 
                      value={htmlContent}
                      onChange={(e) => setHtmlContent(e.target.value)}
                      placeholder="<div class='exercise'>...</div>"
                      className="w-full h-64 bg-black/50 border border-white/10 rounded-xl p-4 font-mono text-sm focus:outline-none focus:border-emerald-500/50 transition-colors resize-none placeholder:text-white/10"
                    />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="block text-[10px] font-mono uppercase text-white/40 tracking-widest">Capturas del ejercicio (Máx 5)</label>
                      {imagePreviews.length > 0 && (
                        <button 
                          onClick={clearImages}
                          className="text-[10px] font-mono uppercase text-white/20 hover:text-red-500 transition-colors"
                        >
                          Limpiar todo
                        </button>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {imagePreviews.map((preview, idx) => (
                        <div key={idx} className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group">
                          <img src={preview} alt={`Preview ${idx}`} className="w-full h-full object-cover bg-black/50" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <button 
                              onClick={() => removeImage(idx)}
                              className="p-2 bg-red-500 text-white rounded-full hover:scale-110 transition-transform"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                      
                      {imagePreviews.length < 5 && (
                        <div 
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={cn(
                            "aspect-video border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all cursor-pointer group",
                            imagePreviews.length === 0 ? "col-span-2 h-64" : "h-full"
                          )}
                        >
                          <Upload className="w-5 h-5 text-white/20 group-hover:text-emerald-500 transition-colors" />
                          <span className="text-[10px] text-white/20 uppercase font-bold">Añadir Captura</span>
                          <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            multiple
                            className="hidden"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <button 
                  onClick={analyzeContent}
                  disabled={isAnalyzing}
                  className="w-full mt-6 py-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/20 disabled:cursor-not-allowed text-black font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.2)]"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5 fill-current" />
                      Resolver Ejercicios
                    </>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <div className="space-y-4">
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200/80">{error}</p>
                </div>
                {needsKeySelection && (
                  <button 
                    onClick={handleOpenKeySelection}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 text-white text-xs font-bold uppercase tracking-widest rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                  >
                    Configurar API Key de Pago
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Results */}
          <div className="lg:col-span-7">
            {!result && !isAnalyzing ? (
              <div className="h-full min-h-[400px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-12 bg-white/[0.02]">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                  <FileCode className="w-10 h-10 text-white/10" />
                </div>
                <h3 className="text-xl font-bold text-white/40">Esperando entrada...</h3>
                <p className="text-sm text-white/20 max-w-xs mt-2">
                  Sube una captura o pega el HTML de Onmat para generar el script de automatización.
                </p>
              </div>
            ) : isAnalyzing ? (
              <div className="h-full min-h-[400px] border border-white/5 rounded-2xl flex flex-col items-center justify-center text-center p-12 bg-white/[0.02]">
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  <Terminal className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-emerald-500 animate-pulse" />
                </div>
                <h3 className="text-xl font-bold text-white/80 mt-8">Analizando Onmat...</h3>
                <p className="text-sm text-white/40 max-w-xs mt-2 font-mono">
                  Extrayendo preguntas y calculando respuestas óptimas.
                </p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                {/* Explanation */}
                <div className="bg-[#151619] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-white/80">Análisis Académico</span>
                  </div>
                  <div className="p-6 prose prose-invert prose-emerald max-w-none">
                    <ReactMarkdown>{result?.explanation || ''}</ReactMarkdown>
                  </div>
                </div>

                {/* Script */}
                <div className="bg-[#151619] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                  <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-bold uppercase tracking-widest text-white/80">Script de Automatización</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const bookmarklet = `javascript:(function(){${result?.script}})();`;
                          copyToClipboard(bookmarklet);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase bg-white/5 text-white/60 hover:bg-white/10 transition-all"
                        title="Copia como Bookmarklet (una sola línea)"
                      >
                        <Play className="w-3 h-3" />
                        Bookmarklet
                      </button>
                      <button 
                        onClick={() => copyToClipboard(result?.script || '')}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all",
                          copied ? "bg-emerald-500 text-black" : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                        )}
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copiado' : 'Copiar Script'}
                      </button>
                    </div>
                  </div>
                  <div className="p-6 bg-black/50 relative group">
                    <pre className="font-mono text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[300px]">
                      {result?.script}
                    </pre>
                    <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity" />
                  </div>
                  <div className="p-4 bg-emerald-500/5 border-t border-white/5 space-y-4">
                    <div className="flex items-center gap-3 text-emerald-500/60">
                      <div className="h-[1px] flex-1 bg-emerald-500/20" />
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Instrucciones de Ejecución</span>
                      <div className="h-[1px] flex-1 bg-emerald-500/20" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[8px]">1</span>
                          Desbloquear
                        </p>
                        <p className="text-[10px] text-white/40 leading-relaxed">
                          Escribe <code className="text-emerald-400 bg-emerald-400/10 px-1 rounded">allow pasting</code> y pulsa Enter.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[8px]">2</span>
                          Contexto (Si falla)
                        </p>
                        <p className="text-[10px] text-white/40 leading-relaxed">
                          Si dice "0 campos", cambia el selector <span className="text-emerald-400 font-bold">"top"</span> en la consola por el frame del ejercicio.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-white/60 uppercase tracking-wider flex items-center gap-2">
                          <span className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center text-[8px]">3</span>
                          Pegar y Ejecutar
                        </p>
                        <p className="text-[10px] text-white/40 leading-relaxed">
                          Usa <span className="text-emerald-400">"Copiar Script"</span> y pégalo. El script ahora busca dentro de iframes automáticamente.
                        </p>
                      </div>
                    </div>

                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                      <p className="text-[10px] text-amber-200/80 font-sans leading-relaxed">
                        <span className="font-bold text-amber-500 uppercase mr-1">¡Cuidado!</span> 
                        El error <code className="bg-amber-500/20 px-1 rounded text-amber-500">Unexpected token ':'</code> suele ocurrir si estás pegando texto que no es código (como un título o una etiqueta). Usa siempre el botón de copiar para obtener el código limpio.
                      </p>
                    </div>

                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                      <p className="text-[10px] text-emerald-200/80 font-sans leading-relaxed">
                        <span className="font-bold text-emerald-500 uppercase mr-1">Pro Tip:</span> 
                        Para ejercicios con imágenes, tablas complejas o gráficos, la **Captura de Pantalla** es mucho más efectiva que el HTML, ya que permite a la IA "ver" el problema completo.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      {/* Footer Decoration */}
      <footer className="max-w-6xl mx-auto px-6 py-12 border-t border-white/5">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 opacity-30">
          <div className="flex items-center gap-4">
            <div className="w-8 h-[1px] bg-white" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em]">Secure Execution Environment</span>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest">© 2026 Onmat Solver Pro • AI-Powered Automation</p>
        </div>
      </footer>
    </div>
  );
}
