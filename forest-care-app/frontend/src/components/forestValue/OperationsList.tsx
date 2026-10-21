import type { RecommendedOperation } from '../../types';
import {
  OPERATION_LABEL,
  TIMING_LABEL,
  TIMING_ORDER,
  formatEur,
  formatNumber,
  standTitle,
} from '../../utils/forestValueFormat';

interface OperationsListProps {
  operations: RecommendedOperation[];
  onSelectStand: (standId: string) => void;
  // Absent when the viewer cannot publish work requests (guest demo)
  onRequestOffers?: (operation: RecommendedOperation) => void;
}

export default function OperationsList({ operations, onSelectStand, onRequestOffers }: OperationsListProps) {
  const groups = TIMING_ORDER.map((timing) => ({
    timing,
    items: operations.filter((o) => o.timing === timing),
  })).filter((g) => g.items.length > 0);

  const totalIncome = operations.reduce((sum, o) => sum + (o.estimatedIncomeEur ?? 0), 0);

  return (
    <section className="fv-section" aria-labelledby="fv-ops-heading">
      <h3 id="fv-ops-heading" className="fv-section-title">Tulevat toimenpiteet</h3>
      {operations.length === 0 ? (
        <p className="fv-muted">Palstalle ei ole lähivuosina suositeltavia toimenpiteitä.</p>
      ) : (
        <>
          <p className="fv-muted">
            Metsäkeskuksen toimenpide-ehdotukset ensisijaisesti, muuten Tapion metsänhoidon suosituksiin
            perustuva arvio.
            {totalIncome > 0 && ` Hakkuiden arvioitu kantorahatulo yhteensä noin ${formatEur(totalIncome)}.`}
          </p>
          <ol className="fv-timeline">
            {groups.map((group) => (
              <li key={group.timing} className="fv-timeline-group">
                <h4 className="fv-timeline-when">{TIMING_LABEL[group.timing]}</h4>
                <ul>
                  {group.items.map((op, index) => (
                    <li key={`${op.standId}-${op.type}-${index}`} className="fv-op">
                      <div className="fv-op-head">
                        <strong>{OPERATION_LABEL[op.type]}</strong>
                        <button type="button" className="fv-op-stand" onClick={() => onSelectStand(op.standId)}>
                          {standTitle(op.standNumber)}
                        </button>
                        <span className={`fv-tag ${op.source === 'metsakeskus' ? '' : 'fv-tag-neutral'}`}>
                          {op.source === 'metsakeskus' ? `Metsäkeskus · ${op.year}` : `Suositus · n. ${op.year}`}
                        </span>
                      </div>
                      <p className="fv-op-reason">{op.reason}</p>
                      {(op.estimatedRemovalM3 !== null || op.estimatedIncomeEur !== null) && (
                        <p className="fv-op-figures">
                          {op.estimatedRemovalM3 !== null && <>Kertymä noin {formatNumber(op.estimatedRemovalM3)} m³</>}
                          {op.estimatedRemovalM3 !== null && op.estimatedIncomeEur !== null && ' · '}
                          {op.estimatedIncomeEur !== null && <>tulo noin {formatEur(op.estimatedIncomeEur)}</>}
                        </p>
                      )}
                      {onRequestOffers && (
                        <button type="button" className="btn-link fv-op-action" onClick={() => onRequestOffers(op)}>
                          Pyydä tarjouksia
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
