# Sistema de Troca e Permuta de Dias de Parques

Permite aos viajantes trocar ou transferir parques entre os dias da viagem diretamente pela aba Parques, suportando transferência direta para dias livres ou permuta mútua completa quando o dia de destino já possui outro parque.

## Decisões Confirmadas pelo Usuário

> [!IMPORTANT]
> Decisões alinhadas e confirmadas na Fase 1:
> - **Gatilho de Troca**: Botão dedicado **"Trocar Dia"** no cabeçalho de cada card de parque na aba *Parques da Minha Viagem*.
> - **Confirmação e Pré-Visualização**: Janela modal interativa com seleção do dia de destino e resumo visual claro das alterações antes da confirmação.
> - **Integridade de Eventos Fixos**: Voos e check-in/check-out de acomodações permanecem estritamente ancorados em suas datas de calendário reais; todo o conteúdo de parques e roteiros diários é trocado.

---

## 1. Visão Geral & Conceito

- **O que faz**:
  Na aba **Parques** (seção *Parques da Minha Viagem*), cada parque agendado conta com a ação **"Trocar Dia"**. Ao clicar, o usuário visualiza uma modal intuitiva onde pode escolher qualquer outro dia da viagem.
  - **Cenário 1 — Destino livre (Sem Parque)**: Transfere o parque, reservas (FastPass / Lightning Lane, Dining, Shows), estratégias de Rope Drop, períodos do roteiro (manhã, tarde, noite, notas) e itens cronológicos do parque para o novo dia. O dia de origem é liberado ("Sem Parque").
  - **Cenário 2 — Destino já ocupado (Permuta mútua)**: Executa a troca cruzada completa entre o Dia A e o Dia B. O parque e roteiro de A vão para B, e o parque e roteiro de B vão para A, preservando todas as informações cadastradas de ambos.
- **Público-alvo**: Usuários planejando férias em Orlando que precisam reorganizar a ordem dos parques (por conta de lotação, clima, ingressos Hopper ou preferências do grupo) sem perder nenhuma anotação ou reserva já feita.
- **Valor Principal**: Elimina a necessidade de apagar e redigitar manualmente todo o roteiro de um dia para reorganizar o calendário da viagem.

---

## 2. Experiência do Usuário & Design Visual

### Fluxo de Uso
1. O usuário entra na aba **Parques** > **📅 Parques da Minha Viagem**.
2. No card de qualquer parque (ex: *Dia 2 - Magic Kingdom*), clica no botão **"Trocar Dia"** no cabeçalho superior.
3. A modal **`SwapParkDayModal`** abre exibindo:
   - Resumo do parque de origem (Dia atual, data formatada, nome do parque e total de reservas).
   - Seletor dos dias da viagem disponíveis com sinalizadores visuais:
     - Dias livres: `Sem Parque (Transferência)`
     - Dias com parque: `Parque Atual: [Nome] (Troca Mútua)`
   - Caixa de destaque explicativa com pré-visualização dinâmica do resultado da ação (em cores suaves e tipografia clara).
   - Aviso informativo de que voos e check-in/out permanecerão em suas datas corretas.
4. Ao clicar em **"Confirmar Troca"**, a transição é executada, sincronizada com o banco de dados Supabase e uma notificação de sucesso é disparada.

### Padrão Visual (Frontend Design Constitution)
- **Cores & Tokens**: Consistentes com a paleta do KingdomCompass (Azul marinho `#1A2B4C`, Dourado `#D4AF37`, Ardósia suave `#F8FAFC` e bordas `#E2E8F0`).
- **Sem AI Slop**: Sem badges de pílula decorativas aleatórias, sem barras laterais grossas (`border-l-4`), tipografia com números tabulares (`tabular-nums font-mono`) para dias e datas.
- **Acessibilidade**: Foco visível, navegação por teclado (`Esc` para cancelar, `Enter` para confirmar quando há dia válido selecionado).

---

## 3. Principais Decisões de Produto & Arquitetura

### Decisão 1: Arquitetura de Estado Centralizada no PlannerContext
- **Abordagem**: Implementar a função `swapOrMoveParkDay(sourceDayNumber: number, targetDayNumber: number)` diretamente no `PlannerContext`.
- **Por quê**: O `PlannerContext` é a única fonte de verdade que orquestra `rawDays`, `itineraryDays`, a sincronização com o Supabase e os horários por hora (`hourlySchedule`).
- **Alternativa Descartada**: Manipulação local no componente `ParksGuideView`, que causaria inconsistências com a aba Roteiro Geral e a persistência na nuvem.

### Decisão 2: Filtro Seletivo de Horários (`hourlySchedule`)
- **Abordagem**: Ao mover/trocar um dia, manter eventos de `sourceType === 'accommodation'` (check-in/check-out) e `sourceType === 'flight'` (embarque, voo, aeroporto) ancorados ao dia do calendário real, enquanto itens de `sourceType === 'park'`, `'show'`, `'fastpass'`, `'dining'` e atividades manuais do dia acompanham o parque.
- **Por quê**: Se o viajante tem um voo que pousa no Dia 1 e faz check-out no Dia 10, trocar o parque do Dia 1 para o Dia 10 não pode transferir o voo de chegada para o final da viagem.

---

## 4. Arquitetura Técnica & Diagrama de Dados

```
┌─────────────────────────────────────────────────────────────┐
│                    ParksGuideView                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Card do Parque (ex: Dia 2 - Magic Kingdom)            │  │
│  │ [Trocar Dia] ──> Abre SwapParkDayModal               │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   SwapParkDayModal                          │
│  • Origem: Dia 2 (Magic Kingdom)                            │
│  • Seletor: Escolher Dia de Destino                         │
│  • Preview em tempo real:                                   │
│    - Destino Livre   ──> "Transferência simples"            │
│    - Destino Ocupado ──> "Troca Mútua (Permuta)"            │
│  • Botão: [Confirmar Troca]                                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             PlannerContext: swapOrMoveParkDay               │
│                                                             │
│  1. Localiza sourceDay e targetDay em rawDays               │
│  2. Se targetDay livre:                                     │
│     - Move park, title, periods, parkBooking                │
│     - Move itens de parque da hourlySchedule                │
│     - Limpa o dia de origem para "Sem Parque"               │
│  3. Se targetDay com parque (Swap Mútuo):                   │
│     - Permuta cruzada de dados e parkBooking                │
│     - Permuta itens de parque da hourlySchedule             │
│  4. Re-sincroniza horários automáticos de ambos os dias     │
│  5. Persiste ambos os dias no Supabase & LocalStorage        │
│  6. Dispara notificação toast de sucesso                    │
└─────────────────────────────────────────────────────────────┘
```

### Componentes Envolvidos:
1. `src/components/SwapParkDayModal.tsx` *(Novo componente)*: Modal moderna para seleção do dia de destino, cálculo do modo (transferência vs permuta) e pré-visualização clara antes do commit.
2. `src/context/PlannerContext.tsx` *(Edição)*: Adição do método `swapOrMoveParkDay` no tipo e na implementação com tratamento de calendário, horários fixos e Supabase.
3. `src/components/ParksGuideView.tsx` *(Edição)*: Inclusão do botão "Trocar Dia" no cabeçalho de cada card de parque e abertura da modal.
