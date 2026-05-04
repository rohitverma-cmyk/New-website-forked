import React from 'react';
import SEOPageLayout from '../SEOPageLayout';

const PolyKnit180gsm = () => {
  const specs = [
    { label: 'Weight', value: '180 GSM (+/- 5%)' },
    { label: 'Composition', value: '100% Polyester, Poly-Spandex (92/8, 90/10)' },
    { label: 'Construction', value: 'Single Jersey, Interlock, Bird Eye Mesh' },
    { label: 'Width', value: '58" - 68" (open width)' },
    { label: 'Stretch', value: '4-way stretch available with spandex blend' },
    { label: 'Performance', value: 'Moisture Wicking, Quick Dry, Breathable' },
    { label: 'MOQ Range', value: '500 - 1,000 kg' },
    { label: 'Lead Time', value: '10-15 days (stock), 25-30 days (production)' },
  ];

  const useCases = [
    'Running and jogging apparel',
    'Gym and workout t-shirts',
    'Athletic jerseys and uniforms',
    'Cycling base layers',
    'Yoga and pilates wear',
    'Summer activewear collections'
  ];

  const relatedLinks = [
    { label: 'View 220 GSM poly knit', url: '/fabrics/poly-knit-fabrics/220-gsm/' },
    { label: 'Jersey poly knit options', url: '/fabrics/poly-knit-fabrics/jersey/' },
    { label: 'Moisture wicking fabrics', url: '/fabrics/poly-knit-fabrics/moisture-wicking/' },
    { label: 'Sportswear fabrics', url: '/fabrics/poly-knit-fabrics/for-sportswear/' },
  ];

  return (
    <SEOPageLayout
      title="180 GSM Polyester Knit Fabric Manufacturers & Suppliers in India"
      metaDescription="Source lightweight 180 GSM poly knit fabric from verified Indian mills. Ideal for activewear, running apparel, and gym wear. Bulk supply available."
      breadcrumbs={[
        { label: 'Fabrics', link: '/fabrics/' },
        { label: 'Poly Knit', link: '/fabrics/poly-knit-fabrics/' },
        { label: '180 GSM' }
      ]}
      intro="Source lightweight 180 GSM polyester knit fabric from India's technical textile specialists. This weight category offers the ideal balance of coverage, breathability, and performance for activewear, running apparel, and warm-weather athletic wear. Our verified suppliers provide consistent quality with moisture management and quick-dry properties for bulk manufacturing."
      specs={specs}
      useCases={useCases}
      pricingNote="180 GSM poly knit pricing depends on composition, construction, and performance finishes. Basic single jersey offers entry-level pricing. Interlock construction and spandex blends cost more. Specialty finishes like moisture wicking and anti-microbial add to base fabric cost. Volume pricing available for orders above 1,000 kg."
      relatedLinks={relatedLinks}
      categoryLink={{ label: 'All Poly Knit Fabrics', url: '/fabrics/poly-knit-fabrics/' }}
    >
      <div className="prose prose-slate max-w-none">
        <h2>Why 180 GSM for Performance Apparel</h2>
        <p>
          180 GSM represents the sweet spot for many activewear applications—substantial enough for quality feel and durability, yet light enough for comfort during physical activity. This weight dominates the running apparel, gym wear, and athletic jersey categories where breathability and moisture management are priorities.
        </p>
        <p>
          Indian mills produce 180 GSM poly knit in various constructions optimized for different end uses. Single jersey offers the most economical option with good drape. Interlock provides a smoother, more substantial hand feel. Bird eye mesh adds ventilation for high-intensity applications.
        </p>

        <h2>Performance Engineering at 180 GSM</h2>
        <p>
          At this weight, poly knit fabrics can effectively incorporate moisture-wicking technology. The fabric structure allows efficient moisture transport from skin to fabric surface where evaporation occurs. Mills achieve this through fiber selection (textured polyester, hollow-core fibers) and finishing treatments.
        </p>
        <p>
          Quick-dry performance complements moisture wicking—fabric that moves sweat away must also dry rapidly. 180 GSM fabrics dry faster than heavier constructions due to lower moisture holding capacity. For athletic apparel, specify both moisture wicking and quick-dry requirements.
        </p>

        <h2>Stretch Options for 180 GSM</h2>
        <p>
          While 100% polyester provides some inherent stretch due to knit construction, adding spandex (typically 8-10%) delivers true four-way stretch for unrestricted movement. Stretch versions suit fitted athletic styles, while 100% polyester works well for looser, more casual fits.
        </p>
        <p>
          When sourcing stretch 180 GSM fabric, specify recovery requirements. Quality stretch fabric returns to original dimensions after stretching. Poor recovery leads to bagging—a critical issue for fitted athletic wear that must maintain shape through wearing and washing.
        </p>

        <h2>Color and Print Considerations</h2>
        <p>
          Polyester accepts disperse dyes, offering excellent colorfastness when properly processed. 180 GSM fabric provides a good surface for sublimation printing—the standard method for full-coverage graphics on polyester. Ensure your supplier confirms sublimation compatibility if your products require printing.
        </p>
        <p>
          For solid colors, specify pantone or reference swatches to communicate requirements clearly. Mills can match specific shades, though minimum quantities apply for custom dyeing. Stock colors (white, black, navy, heather grey) are more readily available in smaller quantities.
        </p>

        <h2>Quality Parameters for Bulk Orders</h2>
        <p>
          When evaluating 180 GSM poly knit samples, assess: weight consistency across roll width; stretch and recovery performance; moisture wicking speed (drop test); pilling resistance; and colorfastness to washing and perspiration. Request test reports documenting these parameters.
        </p>
        <p>
          For production orders, establish acceptable tolerance ranges with your supplier. Weight tolerance of +/- 5% is typical. Tighter tolerances may require premium pricing. Agree on inspection and testing protocols before committing to bulk quantities.
        </p>
      </div>
    </SEOPageLayout>
  );
};

export default PolyKnit180gsm;
