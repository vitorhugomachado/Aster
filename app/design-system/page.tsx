import Link from 'next/link';

const colors = [
  { name: 'Ink', value: '#000000', style: { background: '#000000', color: '#ffffff' } },
  { name: 'Canvas', value: '#FFFFFF', style: { background: '#ffffff', color: '#000000' } },
  { name: 'Soft gray', value: '#F6F6F6', style: { background: '#f6f6f6', color: '#000000' } },
  { name: 'Action blue', value: '#276EF1', style: { background: '#276ef1', color: '#ffffff' } },
  { name: 'Positive', value: '#05944F', style: { background: '#05944f', color: '#ffffff' } },
  { name: 'Negative', value: '#E11900', style: { background: '#e11900', color: '#ffffff' } },
];

const spaces = [4, 8, 12, 16, 24, 32, 40, 48];

export default function DesignSystemPage() {
  return (
    <div className="design-system-page">
      <header className="ds-header">
        <div>
          <span className="ds-kicker">FibraMapa / Design System 1.0</span>
          <h1>Clareza para decisões no mapa.</h1>
          <p>
            Uma linguagem visual de alto contraste, modular e acessível para a operação
            comercial. Inspirada nos princípios de objetividade do Base, adaptada ao contexto
            brasileiro de provedores de fibra.
          </p>
        </div>
        <Link className="ds-back" href="/">Voltar ao sistema →</Link>
      </header>

      <main className="ds-main">
        <section className="ds-section">
          <div className="ds-section-heading">
            <span>01</span><h2>Cores</h2>
            <p>Preto e branco estruturam a interface. Azul indica ação; cores semânticas comunicam estado.</p>
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
            <div className="ds-type-sample"><small>Display / 72 / Bold</small><div className="ds-type-display">Fibra em foco.</div></div>
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
            <p>A ação principal é preta. O azul apoia navegação e foco sem competir com os estados do mapa.</p>
          </div>
          <div className="ds-canvas ds-component-row">
            <button className="ds-button ds-button-primary">Importar clientes</button>
            <button className="ds-button ds-button-secondary">Cancelar</button>
            <button className="ds-button ds-button-tertiary">Ver detalhes</button>
            <button className="ds-button" disabled>Indisponível</button>
          </div>
        </section>

        <section className="ds-section">
          <div className="ds-section-heading">
            <span>05</span><h2>Formulários</h2>
            <p>Rótulos permanecem visíveis, ajuda contextual é curta e o foco recebe contraste azul.</p>
          </div>
          <div className="ds-canvas">
            <label className="ds-field">
              <span>Município</span>
              <input defaultValue="Guaporema" aria-label="Exemplo de município" />
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
      </main>
    </div>
  );
}
