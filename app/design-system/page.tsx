import Link from 'next/link';
import Image from 'next/image';
import { WatermelonButton, WatermelonCard, WatermelonInput } from '@/components/watermelon-system';

const colors = [
  { name: 'Ink', value: '#17161B', style: { background: '#17161b', color: '#ffffff' } },
  { name: 'Canvas', value: '#FFFFFF', style: { background: '#ffffff', color: '#000000' } },
  { name: 'Soft gray', value: '#F1F0F5', style: { background: '#f1f0f5', color: '#17161b' } },
  { name: 'Aster violet', value: '#5B3DF5', style: { background: '#5b3df5', color: '#ffffff' } },
  { name: 'Positive', value: '#087A55', style: { background: '#087a55', color: '#ffffff' } },
  { name: 'Negative', value: '#C9342B', style: { background: '#c9342b', color: '#ffffff' } },
];

const spaces = [4, 8, 12, 16, 24, 32, 40, 48];

export default function DesignSystemPage() {
  return (
    <div className="design-system-page">
      <header className="ds-header">
        <div>
          <span className="ds-kicker">aster / Watermelon Design System</span>
          <h1>Clareza para decisões no mapa.</h1>
          <p>
            Uma linguagem visual modular, acessível e expressiva para a operação comercial.
            Construída com componentes Watermelon e adaptada ao contexto brasileiro de provedores de fibra.
          </p>
        </div>
        <Link className="ds-back" href="/">Voltar ao sistema →</Link>
      </header>

      <main className="ds-main">
        <section className="ds-section">
          <div className="ds-section-heading">
            <span>01</span><h2>Cores</h2>
            <p>Preto e branco estruturam a interface. O violeta Aster indica ação; cores semânticas comunicam estado.</p>
          </div>
          <div className="ds-canvas ds-color-grid">
            {colors.map((color) => (
              <div className="ds-swatch" key={color.name} style={color.style}>
                <b>{color.name}</b><code>{color.value}</code>
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>02</span><h2>Tipografia</h2>
            <p>Geist cria uma hierarquia compacta e legível em painéis densos e telas pequenas.</p>
          </div>
          <div className="ds-canvas">
            <div className="ds-type-sample"><small>Display / 72 / Bold</small><div className="ds-type-display">aster</div></div>
            <div className="ds-type-sample"><small>Heading / 30 / Bold</small><div className="ds-type-title">Clientes localizados em Guaporema</div></div>
            <div className="ds-type-sample"><small>Body / 16 / Regular</small><div className="ds-type-body">Use frases diretas, números fáceis de comparar e rótulos que expliquem a ação antes do clique.</div></div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>03</span><h2>Espaçamento</h2>
            <p>Uma grade base de 4 px mantém ritmo consistente entre controles, cartões e seções.</p>
          </div>
          <div className="ds-canvas ds-space-grid">
            {spaces.map((space) => (
              <div className="ds-space-item" key={space}>
                <div className="ds-space-bar" style={{ height: `${space * 2}px` }} />{space}px
              </div>
            ))}
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>04</span><h2>Ações</h2>
            <p>A ação principal usa o violeta Aster. Preto apoia contraste sem competir com os estados do mapa.</p>
          </div>
          <div className="ds-canvas ds-component-row">
            <WatermelonButton className="ds-button ds-button-primary">Importar clientes</WatermelonButton>
            <WatermelonButton className="ds-button ds-button-secondary">Cancelar</WatermelonButton>
            <WatermelonButton className="ds-button ds-button-tertiary">Ver detalhes</WatermelonButton>
            <WatermelonButton className="ds-button" disabled>Indisponível</WatermelonButton>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>05</span><h2>Formulários</h2>
            <p>Rótulos permanecem visíveis, ajuda contextual é curta e o foco recebe contraste violeta.</p>
          </div>
          <div className="ds-canvas">
            <label className="ds-field">
              <span>Município</span>
              <WatermelonInput defaultValue="Guaporema" aria-label="Exemplo de município" />
              <small>Selecione uma opção oficial do IBGE.</small>
            </label>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>06</span><h2>Estados</h2>
            <p>Cor sempre aparece com texto. Assim, nenhuma informação depende apenas da percepção cromática.</p>
          </div>
          <div className="ds-canvas ds-status-grid">
            <div className="ds-status"><i style={{ background: '#05944f' }} />Cliente ativo</div>
            <div className="ds-status"><i style={{ background: '#e57200' }} />Em instalação</div>
            <div className="ds-status"><i style={{ background: '#e11900' }} />Requer atenção</div>
            <div className="ds-status"><i style={{ background: '#545454' }} />Localização pendente</div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>07</span><h2>Dados</h2>
            <p>Cartões e linhas priorizam cliente, endereço e situação operacional em uma leitura rápida.</p>
          </div>
          <div className="ds-canvas ds-data-card">
            <header><h3>Clientes importados</h3><span>2 localizados</span></header>
            <div className="ds-data-row"><b>Cliente 001</b><span>Av. São José, 214</span><span>Ativo</span></div>
            <div className="ds-data-row"><b>Cliente 002</b><span>Rua do Bosque, 415</span><span>Instalação</span></div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>08</span><h2>Mapa</h2>
            <p>O mapa é a superfície principal. Controles flutuam com bordas discretas, e a seleção usa foco espacial.</p>
          </div>
          <div className="ds-canvas ds-map-pattern">
            <div className="ds-map-grid" />
            <Image className="ds-map-marker marker-green" src="/brand/aster-client-pin.png" alt="Pin de cliente Aster" width={44} height={44} />
            <Image className="ds-map-marker marker-orange" src="/brand/aster-client-pin.png" alt="" width={44} height={44} />
            <Image className="ds-map-marker marker-red" src="/brand/aster-client-pin.png" alt="" width={44} height={44} />
            <div className="ds-map-card"><small>Cliente selecionado</small><b>Av. São José, 214</b><span>Ativo · 600 Mega</span></div>
            <div className="ds-map-controls"><WatermelonButton>+</WatermelonButton><WatermelonButton>−</WatermelonButton><WatermelonButton>◎</WatermelonButton></div>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>09</span><h2>Interação</h2>
            <p>Mouse, teclado e toque recebem a mesma prioridade. Toda ação crítica tem texto, foco e retorno visível.</p>
          </div>
          <div className="ds-canvas ds-rule-grid">
            <WatermelonCard><b>Zoom</b><p>Roda do mouse, pinça, botões e Ctrl + / −.</p></WatermelonCard>
            <WatermelonCard><b>Movimento</b><p>Clique e arraste sem exigir modo especial.</p></WatermelonCard>
            <WatermelonCard><b>Seleção</b><p>O mapa aproxima o ponto e abre o card editável.</p></WatermelonCard>
            <WatermelonCard><b>Erros</b><p>Nunca inventar coordenadas; orientar correção manual.</p></WatermelonCard>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>10</span><h2>Princípios</h2>
            <p>Regras que mantêm o produto consistente conforme novas telas e recursos forem adicionados.</p>
          </div>
          <div className="ds-canvas ds-principles">
            <div><span>01</span><b>Mapa primeiro</b><p>Interface apoia a operação sem competir com o território.</p></div>
            <div><span>02</span><b>Precisão explícita</b><p>Exato, aproximado e pendente nunca usam a mesma linguagem.</p></div>
            <div><span>03</span><b>Menos decoração</b><p>Hierarquia vem de tipografia, espaço e contraste.</p></div>
            <div><span>04</span><b>Ação reversível</b><p>Edição mostra contexto e mantém o cliente acessível.</p></div>
          </div>
        </section>
      </main>
    </div>
  );
}
