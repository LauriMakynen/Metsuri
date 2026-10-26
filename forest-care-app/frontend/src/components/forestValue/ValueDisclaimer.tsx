import type { ForestValueResult } from '../../types';

export default function ValueDisclaimer({ result }: { result: ForestValueResult }) {
  const { data, prices } = result;
  const year = data.inventoryYearMin;

  return (
    <section className="fv-section fv-disclaimer" aria-labelledby="fv-disclaimer-heading">
      <h3 id="fv-disclaimer-heading" className="fv-section-title">Huomiot</h3>
      <ul>
        <li>
          <strong>Arvio on suuntaa-antava, ei virallinen metsäarvio.</strong> Kiinteistökaupassa ja perinnönjaossa
          tarvitaan valtuutetun metsäarvioijan tekemä arvio.
        </li>
        <li>
          {data.provider === 'metsakeskus' && year !== null ? (
            <>
              Metsävaratieto on inventoitu vuonna {year}
              {data.inventoryYearMax !== null && data.inventoryYearMax !== year && `–${data.inventoryYearMax}`}.{' '}
              {data.isOutdated
                ? 'Tieto on yli 5 vuotta vanhaa: puusto on voinut kasvaa tai sitä on voitu hakata.'
                : 'Metsäkeskus päivittää puuston tietoja kasvumalleilla, mutta tehdyt hakkuut näkyvät viiveellä.'}
            </>
          ) : data.provider === 'mock' ? (
            'Laskelma perustuu esimerkkidataan, ei palstan oikeaan metsävaratietoon.'
          ) : (
            'Laskelma perustuu itse syötettyihin puuston tietoihin, joten epävarmuus on suuri.'
          )}
        </li>
        <li>
          Hinnat ovat alueellisia keskimääräisiä kantohintoja ({prices.source === 'luke' ? 'Luke' : 'varahinnat'},{' '}
          {prices.region}
          {prices.period ? `, ${prices.period.replace('M', '/')}` : ''}). Toteutuva hinta riippuu leimikon koosta,
          korjuuoloista ja ostajasta.
        </li>
        <li>
          Lukuun eivät sisälly maapohjan arvo eivätkä nuorten metsien odotusarvo. Taimikoiden puustolle ei lasketa
          arvoa.
        </li>
      </ul>
    </section>
  );
}
