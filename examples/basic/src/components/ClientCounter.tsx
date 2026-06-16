import { useState } from "react";

export default function ClientCounter() {
  const [count, setCount] = useState(0);

  return (
    <section className="demo-panel" data-demo="client-island">
      <p className="eyebrow">React client island</p>
      <h2>React client island</h2>
      <p>This component hydrates in the browser with <code>client:load</code>.</p>
      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Count {count}
      </button>
    </section>
  );
}

