import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON body parser with increased limit for base64 file payloads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API ROUTE: Live Exchange Rate (Server-side proxy)
  app.get("/api/exchange-rate", async (_req, res) => {
    try {
      const response = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL", {
        headers: { "User-Agent": "aistudio-build" },
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.USDBRL) {
          const item = data.USDBRL;
          const rate = parseFloat(item.bid || item.ask || "5.75");
          return res.json({
            success: true,
            data: {
              rate,
              bid: item.bid ? parseFloat(item.bid) : undefined,
              ask: item.ask ? parseFloat(item.ask) : undefined,
              high: item.high ? parseFloat(item.high) : undefined,
              low: item.low ? parseFloat(item.low) : undefined,
              pctChange: item.pctChange ? parseFloat(item.pctChange) : undefined,
              varBid: item.varBid ? parseFloat(item.varBid) : undefined,
              lastUpdated: item.create_date || new Date().toLocaleTimeString("pt-BR"),
              source: "AwesomeAPI (Dólar Comercial)",
            },
          });
        }
      }
    } catch (_err) {
      // Fallback below
    }

    try {
      const response = await fetch("https://open.er-api.com/v6/latest/USD");
      if (response.ok) {
        const data = await response.json();
        if (data && data.rates && data.rates.BRL) {
          const rate = parseFloat(data.rates.BRL);
          return res.json({
            success: true,
            data: {
              rate,
              lastUpdated: new Date().toLocaleTimeString("pt-BR"),
              source: "ExchangeRate API Global",
            },
          });
        }
      }
    } catch (_err) {
      // Fallback below
    }

    return res.json({
      success: true,
      data: {
        rate: 5.16,
        bid: 5.16,
        ask: 5.17,
        high: 5.18,
        low: 5.14,
        pctChange: 0.4,
        lastUpdated: new Date().toLocaleTimeString("pt-BR"),
        source: "Cotação Comercial Estimada",
      },
    });
  });

  // API ROUTE: Parse Documents & Vouchers with Gemini AI
  app.post("/api/ai/parse-document", async (req, res) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          error: "A chave GEMINI_API_KEY não está configurada nos segredos da aplicação.",
        });
      }

      const { files, pastedText, tripContext, voucherCategory } = req.body;

      if ((!files || files.length === 0) && (!pastedText || !pastedText.trim())) {
        return res.status(400).json({
          error: "Nenhum arquivo ou texto de voucher foi enviado para análise.",
        });
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const parts: any[] = [];

      const categoryLabels: Record<string, string> = {
        flights: "Passagens Aéreas / E-Tickets de Voos",
        accommodations: "Reserva de Hospedagem / Hotel / Airbnb / Casa de Temporada",
        parks: "Ingressos de Parques / Vouchers Disney & Universal",
        transport: "Aluguel de Carro / Transporte",
        insurance: "Seguro Viagem",
        photo_package: "Pacote de Fotos / Memory Maker",
        dining_fastpass: "Reserva de Restaurante / Lightning Lane",
        general: "Comprovante Geral / Outros",
      };

      const selectedCategoryName = categoryLabels[voucherCategory] || "Documento / Voucher Geral";

      const systemPrompt = `Você é um assistente especialista em viagens de férias para Orlando, Disney e Flórida.
Sua missão é analisar EXCLUSIVAMENTE o documento do tipo: "${selectedCategoryName}" fornecido pelo usuário.

REGRAS OBRIGATÓRIAS DE EXTRAÇÃO:
1. Podem existir múltiplos vouchers ou múltiplos itens do mesmo tipo (por exemplo, 2 hotéis em datas diferentes, 2 carros alugados, múltiplos bilhetes de passagens ou ingressos). Extraia TODOS os registros identificados sem omitir nenhum.
2. TODA COMPRA / RESERVA COM VALOR FINANCEIRO DEVE GERAR UM ITEM EM "expenses" (Financeiro).
3. IDENTIFICAÇÃO CRUCIAL DE PASSAGEIROS/VIAJANTES: Em TODOS os vouchers, identifique os NOMES EXATOS dos passageiros, hóspedes, segurados ou titulares contidos no documento.
4. VÍNCULO NO FINANCEIRO: No item financeiro em "expenses", preencha "passengerNames" com as pessoas identificadas no voucher. ASSOCIE E MARQUE NO PAGAMENTO APENAS E TÃO SOMENTE AS PESSOAS QUE ESTÃO RELACIONADAS NESTE VOUCHER!
5. Para cada item financeiro em "expenses", identifique:
   - "title": Título descritivo e claro (ex: "Ingresso Disney 4-Day Park Hopper - Maria e João", "Hotel Rosen Inn - 7 Noites", "Passagem Azul Voo AD8701").
   - "category": Categoria exata ("Passagens", "Hospedagem", "Ingressos", "Transporte", "Seguro", "Alimentação", "Compras", "Documentos").
   - "estimatedValueBRL" e/ou "estimatedValueUSD": Valores totais do serviço.
   - "paidValueBRL": Valor efetivamente pago (se já quitado/pago).
   - "status": "Pago" ou "Pendente".
   - "passengerNames": Lista com os nomes dos passageiros/viajantes listados no voucher.
   - "notes": Detalhes como PNR, códigos de confirmação, escalas, assentos e pagador.

DIRETRIZES ESPECÍFICAS DE ANÁLISE PARA O TIPO "${selectedCategoryName}":
${voucherCategory === 'flights' ? `
- Foco em PASSAGENS AÉREAS: Extraia TODOS os trechos (ida, conexões, escalas, volta) em "flights".
- ESCALAS E CONEXÕES: Identifique se há escalas/conexões (ex: "Conexão em Miami (MIA) de 2h 15m"), o aeroporto de escala e se o voo é direto ou com conexões. Informe em "stopoverInfo".
- Localizador PNR/código de reserva (ex: 6 dígitos), Cia aérea, número do voo.
- Aeroportos de origem/destino com cidade e código IATA de 3 letras (ex: GRU, MCO, MIA).
- Datas e horários exatos de partida e chegada, franquia de bagagem e assentos marcados.
- Nomes de todos os passageiros no voo em "passengerNames".
- Crie a despesa correspondente em "expenses" associando APENAS aos passageiros deste voo.
` : voucherCategory === 'accommodations' ? `
- Foco em HOSPEDAGEM (Hotel / Resort Disney/Universal / Airbnb / Casa de Temporada): Extraia em "expenses" (categoria "Hospedagem").
- Nome do hotel/pousada/casa, código de confirmação/reserva.
- Data e horário exatos de Check-in (Entrada) e Check-out (Saída), calculando total de diárias.
- Endereço completo com número, cidade e código postal (ZIP Code).
- Nomes de todos os hóspedes no voucher em "passengerNames" para atribuir o custo no financeiro apenas a eles.
` : voucherCategory === 'parks' ? `
- Foco em INGRESSOS DE PARQUES: Extraia em "expenses" (categoria "Ingressos").
- Nome exato do combo/ingresso, código do voucher/barcode/e-ticket.
- Nomes dos titulares/visitantes nos ingressos em "passengerNames".
- Parques incluídos, quantidade de ingressos/pessoas, número de dias de acesso e valor total pago.
` : voucherCategory === 'transport' ? `
- Foco em ALUGUEL DE CARRO / TRANSPORTE: Extraia em "carRentals" e em "expenses" (categoria "Transporte").
- Empresa locadora, código de confirmação, categoria do veículo.
- Local e data/horário exatos de RETIRADA (Pickup) e DEVOLUÇÃO (Dropoff).
- Motorista e passageiros cadastrados no aluguel em "passengerNames".
` : voucherCategory === 'insurance' ? `
- Foco em SEGURO VIAGEM INTERNACIONAL: Extraia em "expenses" (categoria "Seguro").
- Seguradora, número da apólice/bilhete.
- Nomes de TODOS os segurados cobrindo este bilhete em "passengerNames".
` : voucherCategory === 'photo_package' ? `
- Foco em PACOTE DE FOTOS (Disney Memory Maker / Universal PhotoPass): Extraia em "expenses" (categoria "Ingressos").
- Nome do pacote de fotos, código de ativação/confirmação, e-mail/conta do titular em "passengerNames".
` : `
- Analise e categorize com máxima precisão todas as reservas, custos, voos, escalas e nomes de passageiros contidos no documento.
`}

ATENÇÃO: Extraia o MÁXIMO de informações detalhadas possíveis. Nunca deixe campos essenciais vazios se estiverem presentes no documento.

Você deve extrair e categorizar com precisão os dados encontrados e estruturar o resultado EXATAMENTE no schema JSON solicitado:

1. "summary": Resumo amigável em português (2 a 3 frases) explicando detalhadamente o que foi identificado para "${selectedCategoryName}".
2. "tripUpdates": Dados gerais da viagem detectados no documento (tripName, destination, startDate em formato YYYY-MM-DD, durationDays).
3. "flights": Lista COMPLETA de trechos de passagens aéreas encontrados (incluindo escalas e conexões).
4. "carRentals": Lista de locações de veículos encontradas.
5. "expenses": Lista de despesas financeiras associadas EXCLUSIVAMENTE aos passageiros/viajantes do voucher.
6. "itineraryDays": Sugestão de roteiro para os dias mencionados no voucher.
7. "bookingMilestones": Prazos ou lembretes (ex: "Check-in Voo 24h antes", "Check-in Hotel").

Contexto da viagem atual no app:
- Nome: ${tripContext?.tripName || "Viagem a Orlando"}
- Destino: ${tripContext?.destination || "Orlando"}
- Data de Início: ${tripContext?.startDate || "Não informada"}
- Duração: ${tripContext?.durationDays || 12} dias`;

      parts.push({ text: systemPrompt });

      if (pastedText && pastedText.trim()) {
        parts.push({ text: `TEXTO DO VOUCHER OU COMPROVANTE FORNECIDO:\n${pastedText}` });
      }

      if (files && Array.isArray(files)) {
        for (const file of files) {
          if (file.data && file.mimeType) {
            parts.push({
              inlineData: {
                data: file.data,
                mimeType: file.mimeType,
              },
            });
          } else if (file.text) {
            parts.push({
              text: `CONTEÚDO DO ARQUIVO "${file.name}":\n${file.text}`,
            });
          }
        }
      }

      const candidateModels = [
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
      ];

      const schemaConfig = {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          tripUpdates: {
            type: Type.OBJECT,
            properties: {
              tripName: { type: Type.STRING },
              destination: { type: Type.STRING },
              startDate: { type: Type.STRING },
              durationDays: { type: Type.INTEGER },
              notes: { type: Type.STRING },
            },
          },
          flights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                airline: { type: Type.STRING },
                flightNumber: { type: Type.STRING },
                departureAirport: { type: Type.STRING },
                arrivalAirport: { type: Type.STRING },
                departureDate: { type: Type.STRING },
                departureTime: { type: Type.STRING },
                arrivalDate: { type: Type.STRING },
                arrivalTime: { type: Type.STRING },
                confirmationCode: { type: Type.STRING },
                baggageAllowance: { type: Type.STRING },
                seatNumber: { type: Type.STRING },
                stopoverInfo: { type: Type.STRING },
                passengerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                notes: { type: Type.STRING },
              },
            },
          },
          carRentals: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                company: { type: Type.STRING },
                confirmationCode: { type: Type.STRING },
                category: { type: Type.STRING },
                pickupLocation: { type: Type.STRING },
                pickupDate: { type: Type.STRING },
                pickupTime: { type: Type.STRING },
                dropoffLocation: { type: Type.STRING },
                dropoffDate: { type: Type.STRING },
                dropoffTime: { type: Type.STRING },
                costUSD: { type: Type.NUMBER },
                costBRL: { type: Type.NUMBER },
                status: { type: Type.STRING },
                passengerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                notes: { type: Type.STRING },
              },
            },
          },
          expenses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                estimatedValueBRL: { type: Type.NUMBER },
                estimatedValueUSD: { type: Type.NUMBER },
                paidValueBRL: { type: Type.NUMBER },
                status: { type: Type.STRING },
                passengerNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                notes: { type: Type.STRING },
              },
            },
          },
          itineraryDays: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                dayNumber: { type: Type.INTEGER },
                date: { type: Type.STRING },
                title: { type: Type.STRING },
                park: { type: Type.STRING },
                morningPlan: { type: Type.STRING },
                afternoonPlan: { type: Type.STRING },
                nightPlan: { type: Type.STRING },
                generalNotes: { type: Type.STRING },
              },
            },
          },
          bookingMilestones: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                category: { type: Type.STRING },
                targetDate: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
            },
          },
        },
        required: ["summary", "flights", "expenses", "itineraryDays"],
      };

      let lastError: any = null;
      let rawText = "";

      for (const model of candidateModels) {
        try {
          console.log(`Tentando processar documento com modelo ${model}...`);
          const response = await ai.models.generateContent({
            model,
            contents: { parts },
            config: {
              responseMimeType: "application/json",
              responseSchema: schemaConfig,
              maxOutputTokens: 16384,
            },
          });

          rawText = response.text || "";
          if (rawText.trim()) {
            break;
          }
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          console.log(`[Gemini Fallback] Modelo ${model} indisponível, alternando automaticamente: ${errMsg.substring(0, 100)}...`);
        }
      }

      if (!rawText.trim()) {
        const errorMsg = lastError?.message || "O serviço de IA está temporariamente com alta demanda. Por favor, tente novamente em alguns instantes.";
        return res.status(503).json({
          error: "O modelo de IA está com alta demanda momentânea na nuvem. Por favor, tente novamente em alguns instantes.",
          details: errorMsg,
        });
      }

      let parsedData: any = {};
      try {
        let cleaned = rawText.trim();
        if (cleaned.startsWith("```json")) {
          cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/, "");
        } else if (cleaned.startsWith("```")) {
          cleaned = cleaned.replace(/^```\s*/i, "").replace(/\s*```$/, "");
        }

        // Extract substring between first JSON opener ({ or [) and last closer (} or ])
        const firstBrace = cleaned.indexOf("{");
        const firstBracket = cleaned.indexOf("[");
        let startIdx = 0;
        if (firstBrace !== -1 && firstBracket !== -1) {
          startIdx = Math.min(firstBrace, firstBracket);
        } else if (firstBrace !== -1) {
          startIdx = firstBrace;
        } else if (firstBracket !== -1) {
          startIdx = firstBracket;
        }

        const lastBrace = cleaned.lastIndexOf("}");
        const lastBracket = cleaned.lastIndexOf("]");
        let endIdx = cleaned.length;
        if (lastBrace !== -1 && lastBracket !== -1) {
          endIdx = Math.max(lastBrace, lastBracket) + 1;
        } else if (lastBrace !== -1) {
          endIdx = lastBrace + 1;
        } else if (lastBracket !== -1) {
          endIdx = lastBracket + 1;
        }

        if (startIdx >= 0 && endIdx > startIdx) {
          cleaned = cleaned.substring(startIdx, endIdx);
        }

        try {
          parsedData = JSON.parse(cleaned);
        } catch (innerParseErr) {
          // Attempt to sanitize control characters, trailing commas, or quotes
          const sanitized = cleaned
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, (ch) => "\\u" + ("0000" + ch.charCodeAt(0).toString(16)).slice(-4))
            .replace(/,\s*([\]}])/g, "$1");
          parsedData = JSON.parse(sanitized);
        }
      } catch (jsonErr) {
        console.error("Erro ao fazer parse do JSON retornado pelo Gemini:", jsonErr, rawText.substring(0, 500));
        parsedData = {
          summary: "Documento analisado, mas o formato JSON retornou incompleto. Verifique o conteúdo bruto.",
          flights: [],
          expenses: [],
          itineraryDays: [],
        };
      }

      return res.json({ success: true, data: parsedData });
    } catch (err: any) {
      console.error("AI Parse Document Error:", err);
      return res.status(500).json({ error: err.message || "Falha ao processar arquivo com a Inteligência Artificial." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err: any) => {
    console.error("Server error:", err);
  });
}

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection at:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

