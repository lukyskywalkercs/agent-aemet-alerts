import React from "react";

type Aviso = {
  subzona?: string;
  zona?: string;
  nivel: "NORMALIDAD" | "MEDIA" | "CRÍTICA";
  evento?: string;
  desde?: string;
  hasta?: string;
  desc?: string;
  probabilidad?: string;
  valor?: string;
  comentario?: string;
};

type Props = {
  avisos: Aviso[];
};

export default function AvisosAEMET({ avisos }: Props) {
  const prioridad = (nivel: Aviso["nivel"]) => (nivel === "CRÍTICA" ? 0 : nivel === "MEDIA" ? 1 : 2);

  const isVigente = (a: Aviso) => {
    if (!a.desde && !a.hasta) return true;
    const now = new Date();
    const d = a.desde ? new Date(a.desde) : undefined;
    const h = a.hasta ? new Date(a.hasta) : undefined;
    if (d && now < d) return false;
    if (h && now > h) return false;
    return true;
  };

  const getEstado = (avisosZona: Aviso[]) => {
    const activos = avisosZona.filter(isVigente);
    if (activos.some((a) => a.nivel === "CRÍTICA")) return "CRÍTICO" as const;
    if (activos.some((a) => a.nivel === "MEDIA")) return "MEDIO" as const;
    return "NORMALIDAD" as const;
  };

  const areaCardClasses = (estado: ReturnType<typeof getEstado>) => {
    const base = "my-4 p-4 rounded shadow border flex items-center justify-between";
    if (estado === "CRÍTICO") return `${base} bg-red-50 border-red-600 text-red-900`;
    if (estado === "MEDIO") return `${base} bg-yellow-50 border-yellow-500 text-yellow-900`;
    return `${base} bg-green-50 border-green-500 text-green-900`;
  };

  const badgeClasses = (nivel: Aviso["nivel"]) => {
    const base = "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide";
    if (nivel === "CRÍTICA") return `${base} bg-red-600 text-white`;
    if (nivel === "MEDIA") return `${base} bg-yellow-500 text-black`;
    return `${base} bg-green-600 text-white`;
  };

  const renderEstado = (titulo: string, avisosZona: Aviso[]) => {
    const estado = getEstado(avisosZona);
    const activos = avisosZona.filter(isVigente);
    const totalSubzonas = new Set(activos.map((a) => (a.subzona || a.zona || "")).filter(Boolean)).size;
    const totalAvisos = activos.length;

    return (
      <div className={areaCardClasses(estado)}>
        <div>
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <p className="text-sm opacity-80">{new Date().toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-80">{totalSubzonas} subzonas</span>
          <span className="text-sm opacity-80">{totalAvisos} avisos</span>
          <span className={badgeClasses(estado === "CRÍTICO" ? "CRÍTICA" : estado === "MEDIO" ? "MEDIA" : "NORMALIDAD")}>{estado}</span>
        </div>
      </div>
    );
  };

  const getArea = (a: Aviso) => (a.subzona || a.zona || "");
  const avisos77 = avisos.filter((a) => getArea(a).startsWith("77"));
  const avisos61 = avisos.filter((a) => getArea(a).startsWith("61"));

  const renderSubzonas = (avisosZona: Aviso[]) => {
    const activos = avisosZona.filter(isVigente);
    const porSubzona = activos.reduce<Record<string, Aviso[]>>((acc, a) => {
      const key = (a.subzona || a.zona || "desconocida");
      (acc[key] ||= []).push(a);
      return acc;
    }, {});
    const keys = Object.keys(porSubzona).sort((k1, k2) => {
      const max1 = porSubzona[k1].reduce((m, a) => Math.min(m, prioridad(a.nivel)), 9);
      const max2 = porSubzona[k2].reduce((m, a) => Math.min(m, prioridad(a.nivel)), 9);
      if (max1 !== max2) return max1 - max2;
      return k1.localeCompare(k2);
    });
    return (
      <div className="space-y-3">
        {keys.map((k) => {
          const lista = porSubzona[k];
          const titulo = `${k}${lista[0]?.desc ? ` · ${lista[0]?.desc}` : ""}`;
          const worst = lista.reduce((m, a) => Math.min(m, prioridad(a.nivel)), 9);
          const subCard = worst === 0 ? "border-red-600" : worst === 1 ? "border-yellow-500" : "border-green-500";
          return (
            <div key={k} className={`rounded border-l-4 ${subCard} bg-white p-3 shadow-sm`}>
              <div className="font-medium text-sm mb-2">{titulo}</div>
              <ul className="space-y-1 text-sm text-gray-800">
                {lista.map((av, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={badgeClasses(av.nivel)}>{av.nivel}</span>
                    {av.evento && <span className="font-medium">{av.evento}</span>}
                    {av.valor && <span className="opacity-80">valor: {av.valor}</span>}
                    {av.probabilidad && <span className="opacity-80">prob.: {av.probabilidad}</span>}
                    {av.desde && <span className="opacity-80">desde {new Date(av.desde).toLocaleString()}</span>}
                    {av.hasta && <span className="opacity-80">hasta {new Date(av.hasta).toLocaleString()}</span>}
                    {av.comentario && <span className="opacity-80 italic">{av.comentario}</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {keys.length === 0 && (
          <div className="text-sm text-gray-600">Sin avisos vigentes en subzonas.</div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <section>
        {renderEstado("Zona 77 - Comunidad Valenciana", avisos77)}
        {renderSubzonas(avisos77)}
      </section>
      <section>
        {renderEstado("Zona 61 - Andalucía", avisos61)}
        {renderSubzonas(avisos61)}
      </section>
    </div>
  );
}


