#!/usr/bin/env python3
"""Extract a reproducible GBL numeric verdict from an already finished Blender log.

No Blender binary required. It never converts a completed simulation into a
validated drape unless the physically measured output passes strict gates.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from auto_validation import inspect_report


def parse_log(path):
    observed={}
    errors=[]
    for line in Path(path).read_text(encoding='utf8',errors='replace').splitlines():
        for marker,field in (
            ('GBL_SEWN_GARMENT_COMPLETE ', 'complete'),
            ('GBL_PATTERN_2D_METRIC_FINAL ', 'pattern_final'),
            ('GBL_PATTERN_2D_METRIC_INITIAL ', 'pattern_initial'),
            ('GBL_TEMPORAL_STABILITY ', 'stability'),
            ('GBL_BODY_TRIANGLE_CONTACT ', 'body_contact'),
            ('GBL_MPFB_MEASURED_FIT ', 'avatar_fit'),
        ):
            if line.startswith(marker):
                try:observed[field]=json.loads(line[len(marker):])
                except json.JSONDecodeError:
                    errors.append(marker.strip()+' : JSON illisible')
        if line.startswith(('RuntimeError:', 'ValueError:', 'AttributeError:', 'IndexError:')):
            errors.append(line[:500])
    report=observed.get('complete')
    if not report:
        return {'status':'CRASH_OR_INCOMPLETE','errors':errors,
                'observed_markers':sorted(observed),
                'message':'Aucun rapport de fin de simulation dans ce journal.'}
    result=inspect_report(report)
    spatial=report.get('spatial_diagnostic') or {}
    summary={
        'status':'NUMERICALLY_ACCEPTED_NEEDS_VISUAL_REVIEW' if result['accepted_by_numeric_gates'] else 'REJECTED_DRAPE',
        'calculation_finished':bool(report.get('calculation_finished')),
        'avatar_height_m':report.get('avatar',{}).get('target_height_m'),
        'json_bodice_cm':report.get('fit_preflight',{}).get('corsage_total_cm'),
        'avatar_chest_estimate_cm':(report.get('avatar_actual_fit') or {}).get('estimated_avatar_chest_cm'),
        'assembled_mesh':report.get('assembly_preflight',{}).get('connected_components')==1,
        'pattern_large_strain_initial_pct':round(100*(report.get('pattern_2d_metric_initial') or {}).get('fraction_large_stretch',0),2),
        'pattern_large_strain_final_pct':round(100*(report.get('pattern_2d_metric_final') or {}).get('fraction_large_stretch',0),2),
        'vertical_span_ratio':result.get('vertical_extent_ratio'),
        'body_triangle_intersections':(report.get('final_body_triangle_overlap') or {}).get('intersection_pairs'),
        'stability':report.get('temporal_stability'),
        'evaluation':result,'errors':errors,
    }
    return summary


def french_report(data):
    result=['# Diagnostic automatique du journal Blender', '',
            '**Verdict : '+data['status']+'**', '']
    if data['status']=='CRASH_OR_INCOMPLETE':
        result.extend(['Aucune simulation finale vérifiable.']+['- '+str(e) for e in data['errors']])
    else:
        result.extend([
            '- Simulation terminée : '+str(data['calculation_finished']),
            '- Patron JSON, tour corsage : '+str(data['json_bodice_cm'])+' cm',
            '- Poitrine MPFB estimée : '+str(data['avatar_chest_estimate_cm'])+' cm',
            '- Maillage connecté : '+str(data['assembled_mesh']),
            '- Arêtes fortement déformées : '+str(data['pattern_large_strain_initial_pct'])+' % → '+str(data['pattern_large_strain_final_pct'])+' %',
            '- Expansion verticale du maillage : ×'+str(data['vertical_span_ratio']),
            '- Paires de triangles tissu/corps en intersection potentielle : '+str(data['body_triangle_intersections']),
            '', '## Échecs de contrôle',
        ]+['- '+item for item in data['evaluation']['blockers']])
        checks=(data.get('stability') or {}).get('checks',[])
        if checks:
            result+=['','## Déplacements mesurés']
            for check in checks:
                result.append('- Frames '+str(check['from_frame'])+' → '+str(check['to_frame'])+
                              ' : moyenne '+str(check.get('mean_displacement_cm'))+
                              ' cm, p95 '+str(check.get('p95_displacement_cm'))+' cm')
    result+=['','Ce diagnostic est basé sur des métriques du journal. Il ne certifie pas la qualité de confection, ni une équivalence CLO3D.']
    return '\n'.join(result)+'\n'


def main(argv=None):
    parser=argparse.ArgumentParser()
    parser.add_argument('log',type=Path)
    parser.add_argument('--out',type=Path,default=None)
    args=parser.parse_args(argv)
    summary=parse_log(args.log)
    stem=args.out or args.log.with_suffix('')
    json_out=stem.with_name(stem.name+'_analyse.json')
    md_out=stem.with_name(stem.name+'_analyse.md')
    json_out.write_text(json.dumps(summary,indent=2,ensure_ascii=False),encoding='utf8')
    md_out.write_text(french_report(summary),encoding='utf8')
    print(french_report(summary))
    print('Rapports :',json_out,md_out)
    return 0 if summary['status'].startswith('NUMERICALLY') else 2

if __name__=='__main__':
    raise SystemExit(main())
