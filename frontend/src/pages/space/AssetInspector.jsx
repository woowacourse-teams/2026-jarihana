import { ASSET_FINISHES, ASSET_SURFACES } from './assetCustomization';
import { CATALOG, assetType } from './roomState';

export function AssetInspector({ item, items, onChange, onAttach, onDuplicate }) {
  const type=assetType(item);
  const parent=items.find(entry=>entry.id===item.parentId);
  return <details className="space-studio__asset-inspector">
    <summary data-ph-capture-attribute-action="space_asset_inspect">크기 · 재질 · 소품 배치</summary>
    <div className="space-studio__asset-properties">
      {['scaleX','scaleZ','scaleY'].map((key,i)=><label key={key}>{['너비','깊이','높이'][i]} 배율
        <input aria-label={`${['너비','깊이','높이'][i]} 배율`} type="number" min="0.25" max="3" step="0.05" value={item[key]??1}
          data-ph-capture-attribute-action="space_asset_scale" onChange={event=>onChange({[key]:Number(event.target.value)})}/></label>)}
      <label>색상<input aria-label="에셋 색상" type="color" value={item.color||'#b38d63'} data-ph-capture-attribute-action="space_asset_color" onChange={event=>onChange({color:event.target.value})}/></label>
      <label>재질<select aria-label="에셋 재질" value={item.finish||'auto'} data-ph-capture-attribute-action="space_asset_finish" onChange={event=>onChange({finish:event.target.value})}>
        {ASSET_FINISHES.map(finish=><option key={finish.id} value={finish.id}>{finish.name}</option>)}</select></label>
      {(type?.prop||item.kind==='wallPrint')&&<label>디자인<select aria-label="소품 디자인" value={item.variant||0} data-ph-capture-attribute-action="space_asset_variant" onChange={event=>onChange({variant:Number(event.target.value)})}>
        {[0,1,2,3,4,5].map(n=><option key={n} value={n}>디자인 {n+1}</option>)}</select></label>}
      {type?.mount&&<label>설치 높이 (m)<input aria-label="설치 높이" type="number" min="0" max="14" step="0.1" value={item.elevation||0}
        data-ph-capture-attribute-action="space_asset_elevation" onChange={event=>onChange({elevation:Number(event.target.value)})}/></label>}
      {type?.prop&&<><label className="space-studio__asset-support">놓을 가구<select aria-label="소품을 놓을 가구" value={item.parentId||''} data-ph-capture-attribute-action="space_asset_attach" onChange={event=>onAttach(event.target.value)}>
        <option value="">바닥에 놓기</option>{items.filter(entry=>ASSET_SURFACES[entry.kind]&&!entry.parentId).map((entry,index)=><option key={entry.id} value={entry.id}>{CATALOG.find(type=>type.kind===entry.kind)?.name} · {(entry.level||0)===1?'중층':'1층'} #{index+1}</option>)}</select></label>
        {parent&&<label>선반 단<select aria-label="선반 단" value={item.surfaceIndex||0} data-ph-capture-attribute-action="space_asset_surface" onChange={event=>onChange({surfaceIndex:Number(event.target.value)})}>
          {ASSET_SURFACES[parent.kind].map((height,i)=><option key={i} value={i}>{i+1}단 · {(height*(parent.scaleY||1)).toFixed(2)}m</option>)}</select></label>}</>}
      <button type="button" data-ph-capture-attribute-action="space_asset_duplicate" onClick={onDuplicate}>복제하기</button>
    </div>
    {parent&&<p>가구와 함께 이동해요. 소품을 끌어서 상판 위 위치를 바꿀 수 있어요.</p>}
  </details>;
}
