// src/MenuDashboard.tsx
import { useState, useEffect, useMemo, useRef, type FormEvent } from 'react';
import { supabase } from './supabaseClient';
import Chatbot, { type ChatbotHandle } from './Chatbot';

// --- TYPE DEFINITIONS ---
interface FlavorProfile {
  index: string;
  remark: string;
}
interface Ingredient {
  name: string;
  story: string;
  flavor_profiles: FlavorProfile[];
}
interface MainFlavor {
  name: string;
  flavor_profiles: FlavorProfile[];
}
interface MenuItem {
  id: number;
  created_at: string;
  name: string;
  story: string | null;
  price: number;
  in_stock: boolean;
  type: 'dish' | 'wine';
  ingredients?: Ingredient[] | null;
  main_flavors?: MainFlavor[] | null;
}

// 輔助函式：產生包含 6 個空白風味欄位的物件
const createFlavorProfiles = () => Array(6).fill(null).map(() => ({ index: '', remark: '' }));
const createNewIngredient = (): Ingredient => ({ name: '', story: '', flavor_profiles: createFlavorProfiles() });
const createNewMainFlavor = (): MainFlavor => ({ name: '', flavor_profiles: createFlavorProfiles() });

export default function MenuDashboard() {
  const chatbotRef = useRef<ChatbotHandle>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'dish' | 'wine'>('all');

  // --- FORM STATE ---
  const [formItemType, setFormItemType] = useState<'dish' | 'wine'>('dish');
  const [formName, setFormName] = useState('');
  const [formStory, setFormStory] = useState('');
  const [formPrice, setFormPrice] = useState('');
  const [formInStock, setFormInStock] = useState(true);
  const [formIngredients, setFormIngredients] = useState<Ingredient[]>([createNewIngredient()]);
  const [formMainFlavors, setFormMainFlavors] = useState<MainFlavor[]>([createNewMainFlavor()]);

  // --- DATA FETCHING & FILTERING ---
  async function fetchItems() {
    setLoading(true);
    try {
      const [dishesRes, winesRes] = await Promise.all([
        supabase.from('dishes').select('*'),
        supabase.from('wines').select('*')
      ]);
      if (dishesRes.error) throw dishesRes.error;
      if (winesRes.error) throw winesRes.error;
      const dishes: MenuItem[] = dishesRes.data.map(d => ({ ...d, type: 'dish' }));
      const wines: MenuItem[] = winesRes.data.map(w => ({ ...w, type: 'wine' }));
      const allItems = [...dishes, ...wines].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setItems(allItems);
    } catch (error: any) {
      console.error('抓取資料時發生錯誤:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchItems() }, []);

  const filteredItems = useMemo(() => {
    if (activeFilter === 'dish') return items.filter(item => item.type === 'dish');
    if (activeFilter === 'wine') return items.filter(item => item.type === 'wine');
    return items;
  }, [items, activeFilter]);

  // --- FORM HANDLING ---
  const openAddModal = () => {
    setEditingItem(null);
    setFormName(''); setFormStory(''); setFormPrice(''); setFormInStock(true);
    setFormIngredients([createNewIngredient()]);
    setFormMainFlavors([createNewMainFlavor()]);
    setFormItemType('dish');
    setIsFormModalOpen(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditingItem(item);
    setFormItemType(item.type);
    setFormName(item.name);
    setFormStory(item.story || '');
    setFormPrice(String(item.price));
    setFormInStock(item.in_stock);

    const fillFlavorProfiles = (profiles: FlavorProfile[] | undefined | null) => {
        const existingProfiles = profiles || [];
        const filledProfiles = [
            ...existingProfiles,
            ...Array(Math.max(0, 6 - existingProfiles.length)).fill(null).map(() => ({ index: '', remark: '' }))
        ];
        return filledProfiles.slice(0, 6);
    };

    if (item.type === 'dish') {
      const ingredients = (item.ingredients && item.ingredients.length > 0 ? item.ingredients : [createNewIngredient()]).map(ing => ({
        ...ing,
        flavor_profiles: fillFlavorProfiles(ing.flavor_profiles)
      }));
      setFormIngredients(ingredients);
      setFormMainFlavors([createNewMainFlavor()]);
    } else if (item.type === 'wine') {
      const mainFlavors = (item.main_flavors && item.main_flavors.length > 0 ? item.main_flavors : [createNewMainFlavor()]).map(mf => ({
          ...mf,
          flavor_profiles: fillFlavorProfiles(mf.flavor_profiles)
      }));
      setFormMainFlavors(mainFlavors);
      setFormIngredients([createNewIngredient()]);
    }
    setIsFormModalOpen(true);
  };

  const handleIngredientChange = (ingIndex: number, field: 'name' | 'story', value: string) => { const updated = [...formIngredients]; updated[ingIndex][field] = value; setFormIngredients(updated); };
  const handleMainFlavorChange = (mfIndex: number, value: string) => { const updated = [...formMainFlavors]; updated[mfIndex].name = value; setFormMainFlavors(updated); };
  const handleFlavorProfileChange = (parentIndex: number, fpIndex: number, field: 'index' | 'remark', value: string) => {
    if (formItemType === 'dish') {
      const updated = [...formIngredients];
      updated[parentIndex].flavor_profiles[fpIndex][field] = value;
      setFormIngredients(updated);
    } else {
      const updated = [...formMainFlavors];
      updated[parentIndex].flavor_profiles[fpIndex][field] = value;
      setFormMainFlavors(updated);
    }
  };
  const addIngredientField = () => { setFormIngredients([...formIngredients, createNewIngredient()]) };
  const removeIngredientField = (ingIndex: number) => { setFormIngredients(formIngredients.filter((_, i) => i !== ingIndex)); };
  const addMainFlavorField = () => { setFormMainFlavors([...formMainFlavors, createNewMainFlavor()]) };
  const removeMainFlavorField = (mfIndex: number) => { setFormMainFlavors(formMainFlavors.filter((_, i) => i !== mfIndex)); };
  
  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formName || !formPrice) return alert('名稱和價格為必填項目！');
    
    let itemData: any = { name: formName, story: formStory, price: Number(formPrice), in_stock: formInStock };
    let tableName = formItemType === 'dish' ? 'dishes' : 'wines';

    const filterEmptyProfiles = (profiles: FlavorProfile[]) => profiles.filter(fp => fp.index.trim() !== '' || fp.remark.trim() !== '');

    if (formItemType === 'dish') {
      itemData.ingredients = formIngredients.map(ing => ({ ...ing, flavor_profiles: filterEmptyProfiles(ing.flavor_profiles) })).filter(ing => ing.name.trim() !== '');
    } else {
      itemData.main_flavors = formMainFlavors.map(mf => ({ ...mf, flavor_profiles: filterEmptyProfiles(mf.flavor_profiles) })).filter(mf => mf.name.trim() !== '');
    }
    
    if (editingItem) {
      const { data, error } = await supabase.from(tableName).update(itemData).eq('id', editingItem.id).select();
      if (error) { alert(`更新失敗！\n${error.message}`); } 
      else if (data) {
        setItems(currentItems => currentItems.map(item => item.id === editingItem.id && item.type === editingItem.type ? { ...data[0], type: editingItem.type } : item));
        setIsFormModalOpen(false);
      }
    } else {
      const { data, error } = await supabase.from(tableName).insert([itemData]).select();
      if (error) { alert(`新增失敗！\n${error.message}`); } 
      else if (data) {
        const newItem: MenuItem = { ...data[0], type: formItemType };
        setItems(currentItems => [newItem, ...currentItems]);
        setIsFormModalOpen(false);
      }
    }
  }
  
  async function handleDeleteItem(itemId: number, itemType: 'dish' | 'wine') { if (!window.confirm('你確定要刪除嗎？')) return; const tableName = itemType === 'dish' ? 'dishes' : 'wines'; const { error } = await supabase.from(tableName).delete().eq('id', itemId); if (error) { alert(`刪除失敗！\n${error.message}`); } else { setItems(currentItems => currentItems.filter(item => !(item.id === itemId && item.type === itemType))); } }
  async function handleIngestData() { if (!window.confirm('確定要同步資料到 AI 知識庫嗎？')) return; alert('開始同步...'); const { data, error } = await supabase.functions.invoke('ingest-data'); if (error) { alert(`同步失敗！\n${error.message}`); } else { alert(`同步成功！訊息：${(data as any).message}`); } }
  const handleTellStory = (itemName: string) => { chatbotRef.current?.submitQuery(`請告訴我關於「${itemName.split('\n')[0]}」的故事`); };

  return (
    <>
      <main className="flex flex-1 overflow-hidden p-4 gap-4 h-full">
        <aside className="w-1/3 xl:w-1/4 bg-gray-200 rounded-lg shadow-lg p-4 flex flex-col">
          <h2 className="text-xl font-bold text-black border-b-2 border-gray-300 pb-2 mb-4">菜單 / 酒單列表</h2>
          <div className="flex border border-gray-300 rounded-md mb-4 bg-white">
            <button onClick={() => setActiveFilter('all')} className={`flex-1 p-2 text-sm font-semibold rounded-l-md transition-colors ${activeFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>全部</button>
            <button onClick={() => setActiveFilter('dish')} className={`flex-1 p-2 text-sm font-semibold transition-colors border-l border-r border-gray-300 ${activeFilter === 'dish' ? 'bg-red-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>菜品</button>
            <button onClick={() => setActiveFilter('wine')} className={`flex-1 p-2 text-sm font-semibold rounded-r-md transition-colors ${activeFilter === 'wine' ? 'bg-purple-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>酒品</button>
          </div>
          <div className="flex-1 overflow-y-auto pr-2">
            {loading ? <p>載入中...</p> : 
              filteredItems.map((item) => (
                <div key={`${item.type}-${item.id}`} className="bg-white p-4 rounded-lg mb-3 shadow">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="flex-1 font-bold text-gray-900 mb-1 whitespace-pre-wrap">{item.name}</h3>
                    <span className={`flex-shrink-0 text-xs px-2 py-1 rounded-full text-white ${item.type === 'dish' ? 'bg-red-500' : 'bg-purple-500'}`}>{item.type === 'dish' ? '菜品' : '酒品'}</span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">${item.price}</p>
                  <div className="mt-2 text-xs">
                    {item.type === 'dish' && item.ingredients?.map((ing, index) => (<div key={index} className="mb-1"><span className="font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded-full">{ing.name}</span></div>))}
                    {item.type === 'wine' && item.main_flavors?.map((mf, index) => (<div key={index} className="mb-1"><span className="font-semibold bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">{mf.name}</span></div>))}
                  </div>
                  <div className="text-sm mt-3 pt-2 border-t border-gray-200 flex gap-4 items-center">
                    <button onClick={() => handleTellStory(item.name)} className="text-green-600 font-medium hover:underline">故事</button>
                    <button onClick={() => openEditModal(item)} className="text-blue-600 font-medium hover:underline">編輯</button>
                    <button onClick={() => handleDeleteItem(item.id, item.type)} className="text-red-600 font-medium hover:underline">刪除</button>
                  </div>
                </div>
              ))
            }
          </div>
        </aside>
        
        <section className="flex-1 flex flex-col gap-4">
          <div className="flex-1 bg-white rounded-lg shadow-lg overflow-hidden"><Chatbot ref={chatbotRef} /></div>
          <footer className="flex gap-4">
             <button onClick={openAddModal} className="flex-1 p-3 bg-blue-500 text-white font-bold rounded-lg shadow-md hover:bg-blue-600">新增項目</button>
             <button onClick={handleIngestData} className="flex-1 p-3 bg-red-600 text-white font-bold rounded-lg shadow-md hover:bg-teal-700">同步語料到 AI</button>
          </footer>
        </section>
      </main>

      {isFormModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-4xl">
            <h2 className="text-2xl font-semibold mb-6">{editingItem ? '編輯項目' : '新增項目'}</h2>
            {!editingItem && (
              <div className="flex gap-4 mb-4">
                <label className="flex items-center"><input type="radio" value="dish" checked={formItemType === 'dish'} onChange={() => setFormItemType('dish')} className="mr-2"/> 菜品</label>
                <label className="flex items-center"><input type="radio" value="wine" checked={formItemType === 'wine'} onChange={() => setFormItemType('wine')} className="mr-2"/> 酒品</label>
              </div>
            )}
            <form onSubmit={handleFormSubmit}>
              <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-4">
                <textarea placeholder="名稱 (必填)" value={formName} onChange={(e) => setFormName(e.target.value)} rows={2} className="w-full p-3 border rounded-md"/>
                <textarea placeholder="故事 (選填)" value={formStory} onChange={(e) => setFormStory(e.target.value)} rows={3} className="w-full p-3 border rounded-md"/>
                
                {formItemType === 'dish' && (
                  <div className="space-y-4">
                    {formIngredients.map((ingredient, ingIndex) => (
                      <div key={ingIndex} className="p-4 border rounded-md bg-gray-50 relative">
                        {formIngredients.length > 1 && (<button type="button" onClick={() => removeIngredientField(ingIndex)} className="absolute top-2 right-2 p-1 text-red-500 font-bold">✕</button>)}
                        <label className="font-semibold text-gray-700">食材 #{ingIndex + 1}</label>
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <input type="text" placeholder="食材名稱" value={ingredient.name} onChange={(e) => handleIngredientChange(ingIndex, 'name', e.target.value)} className="w-full p-2 border rounded-md"/>
                          <textarea placeholder="食材故事" value={ingredient.story} onChange={(e) => handleIngredientChange(ingIndex, 'story', e.target.value)} rows={2} className="w-full p-2 border rounded-md"/>
                        </div>
                        <div className="mt-4">
                          <label className="text-sm font-semibold text-gray-600">風味 Index & Remark (6組)</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-1">
                            {ingredient.flavor_profiles.map((fp, fpIndex) => (
                              <div key={fpIndex} className="flex items-center gap-2">
                                <input type="text" placeholder="Index" value={fp.index} onChange={(e) => handleFlavorProfileChange(ingIndex, fpIndex, 'index', e.target.value)} className="w-24 p-1 border rounded-md text-sm"/>
                                <input type="text" placeholder="Remark" value={fp.remark} onChange={(e) => handleFlavorProfileChange(ingIndex, fpIndex, 'remark', e.target.value)} className="flex-1 p-1 border rounded-md text-sm"/>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addIngredientField} className="mt-2 text-sm text-blue-600 hover:underline">+ 新增更多食材</button>
                  </div>
                )}
                
                {formItemType === 'wine' && (
                  <div className="space-y-4">
                    {formMainFlavors.map((mainFlavor, mfIndex) => (
                      <div key={mfIndex} className="p-4 border rounded-md bg-gray-50 relative">
                        {formMainFlavors.length > 1 && (<button type="button" onClick={() => removeMainFlavorField(mfIndex)} className="absolute top-2 right-2 p-1 text-red-500 font-bold">✕</button>)}
                        <label className="font-semibold text-gray-700">主要風味 #{mfIndex + 1}</label>
                        <input type="text" placeholder="風味名稱 (例：果香)" value={mainFlavor.name} onChange={(e) => handleMainFlavorChange(mfIndex, e.target.value)} className="w-full p-2 border rounded-md mt-2"/>
                        <div className="mt-4">
                          <label className="text-sm font-semibold text-gray-600">風味 Index & Remark (6組)</label>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 mt-1">
                            {mainFlavor.flavor_profiles.map((fp, fpIndex) => (
                              <div key={fpIndex} className="flex items-center gap-2">
                                <input type="text" placeholder="Index" value={fp.index} onChange={(e) => handleFlavorProfileChange(mfIndex, fpIndex, 'index', e.target.value)} className="w-24 p-1 border rounded-md text-sm"/>
                                <input type="text" placeholder="Remark" value={fp.remark} onChange={(e) => handleFlavorProfileChange(mfIndex, fpIndex, 'remark', e.target.value)} className="flex-1 p-1 border rounded-md text-sm"/>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                    <button type="button" onClick={addMainFlavorField} className="mt-2 text-sm text-blue-600 hover:underline">+ 新增更多主要風味</button>
                  </div>
                )}
                
                <input type="number" placeholder="價格 (必填)" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} className="w-full p-3 border rounded-md"/>
                <div className="flex items-center">
                    <input type="checkbox" id="inStockCheck" checked={formInStock} onChange={(e) => setFormInStock(e.target.checked)} className="h-5 w-5 rounded"/>
                    <label htmlFor="inStockCheck" className="ml-3 text-sm font-medium text-gray-700">是否有庫存</label>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={() => setIsFormModalOpen(false)} className="px-6 py-2 bg-gray-200 rounded-md">取消</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md">{editingItem ? '儲存變更' : '確認新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}