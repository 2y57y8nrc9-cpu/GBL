#!/usr/bin/env python3
"""Evaluate experiment reports without claiming textile manufacturing certification.
Usage: python tools/v3_acceptance.py pattern.json [rapport_couture.json]
"""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from garmentlab.v3_quality import acceptance

def main():
 if len(sys.argv)<2:
  print('Usage : python tools/v3_acceptance.py pattern.json [rapport_couture.json]');return 2
 spec=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
 report=json.loads(Path(sys.argv[2]).read_text(encoding='utf8')) if len(sys.argv)>2 else None
 findings=acceptance(spec,report)
 if report:
  mesh=report.get('cloth_faces',0)
  worst=max((s.get('max_cm',0) for s in report.get('final_gap_by_seam',[])),default=0)
  findings['cloth_faces']=mesh
  findings['max_seam_gap_cm']=worst
  findings['surface_resolution']='high_candidate' if mesh>=8000 else 'medium_candidate' if mesh>=3000 else 'low'
  findings['seam_closure_check']='review_required' if worst>3 else 'pass_threshold' if worst else 'no_seam_data'
  findings['avatar_source']=report.get('avatar',{}).get('source','unknown')
  findings['material_validation']='not_lab_calibrated'
  findings['photo_vs_sim_similarity']='not_evaluated'
 print(json.dumps(findings,ensure_ascii=False,indent=2))
 return 0
if __name__=='__main__':sys.exit(main())
