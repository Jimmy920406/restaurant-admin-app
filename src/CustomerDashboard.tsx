// src/CustomerDashboard.tsx
import { useState, useEffect, type FormEvent, type ChangeEvent } from 'react';
import { supabase } from './supabaseClient';
import Papa from 'papaparse';

// 定義客戶資料的 TypeScript 型別
interface Customer {
  id: number;
  created_at: string;
  call_date: string | null;
  caller_name: string | null;
  customer_name: string | null;
  call_connected: boolean | null;
  reaction_type: string | null;
  revisit_intention: boolean | null;
  needs_notes: string | null;
  recommended_plan: string | null;
  follow_up_needed: boolean | null;
  next_call_date: string | null;
  remarks: string | null;
}

type CustomerFormData = Partial<Omit<Customer, 'id' | 'created_at'>>;

export default function CustomerDashboard() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formData, setFormData] = useState<CustomerFormData>({});
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function fetchCustomers() {
    setLoading(true);
    const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
    if (error) { console.error('抓取客戶資料錯誤:', error); alert(error.message); } 
    else { setCustomers(data as Customer[]); }
    setLoading(false);
  }

  useEffect(() => { fetchCustomers() }, []);

  const openAddModal = () => {
    setEditingCustomer(null);
    setFormData({});
    setIsFormModalOpen(true);
  };

  const openEditModal = (customer: Customer) => {
    const formattedCustomer = {
        ...customer,
        call_date: customer.call_date ? new Date(customer.call_date).toISOString().split('T')[0] : '',
        next_call_date: customer.next_call_date ? new Date(customer.next_call_date).toISOString().split('T')[0] : '',
    };
    setEditingCustomer(customer);
    setFormData(formattedCustomer);
    setIsFormModalOpen(true);
  };

  const handleFormChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    setFormData(prev => ({ ...prev, [name]: isCheckbox ? (e.target as HTMLInputElement).checked : value }));
  };

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formData.customer_name) {
      alert('顧客姓名為必填項目！');
      return;
    }
    if (editingCustomer) {
      const { error } = await supabase.from('customers').update(formData).eq('id', editingCustomer.id);
      if (error) { alert(`更新失敗: ${error.message}`); } 
      else { await fetchCustomers(); setIsFormModalOpen(false); }
    } else {
      const { error } = await supabase.from('customers').insert([formData]);
      if (error) { alert(`新增失敗: ${error.message}`); }
      else { await fetchCustomers(); setIsFormModalOpen(false); }
    }
  }

  async function handleDeleteCustomer(customerId: number) {
    if (!window.confirm('確定要刪除這位客戶的資料嗎？')) return;
    const { error } = await supabase.from('customers').delete().eq('id', customerId);
    if (error) { alert(`刪除失敗: ${error.message}`); }
    else { setCustomers(prev => prev.filter(c => c.id !== customerId)); }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) { setUploadFile(e.target.files[0]); } };
  const handleUpload = () => {
    if (!uploadFile) return alert('請先選擇一個 CSV 檔案！');
    setIsUploading(true);
    Papa.parse(uploadFile, {
      header: true, skipEmptyLines: true,
      complete: async (results) => {
        const formattedData = results.data.map((row: any) => ({
          call_date: row['電訪日期'] || null, caller_name: row['電訪人員'] || null,
          customer_name: row['顧客姓名'] || null, call_connected: row['電話是否接通']?.includes('✅'),
          reaction_type: row['顧客反應類型'] || null, revisit_intention: row['近期是否回訪意願']?.includes('✅'),
          needs_notes: row['需求備註'] || null, recommended_plan: row['推薦方案'] || null,
          follow_up_needed: row['是否需追蹤']?.includes('✅'), next_call_date: row['預計回電日期'] || null,
          remarks: row['備註'] || null,
        }));
        const { error } = await supabase.from('customers').insert(formattedData);
        setIsUploading(false);
        if (error) { alert(`上傳失敗：${error.message}`); } 
        else {
          alert(`成功上傳 ${formattedData.length} 筆客戶資料！`);
          setIsUploadModalOpen(false); setUploadFile(null); await fetchCustomers();
        }
      },
      error: (error: any) => { setIsUploading(false); alert(`CSV 解析失敗：${error.message}`); }
    });
  };

  return (
    <>
      <div className="p-4 md:p-8 h-full">
        <div className="bg-white p-6 rounded-lg shadow-lg h-full flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">客戶資料列表</h2>
            <div className="flex gap-4">
              <button onClick={() => setIsUploadModalOpen(true)} className="p-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-teal-700">上傳 CSV</button>
              <button onClick={openAddModal} className="p-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700">+ 新增客戶</button>
            </div>
          </div>
          {/* --- 修正點：加入 overflow-x-auto 讓表格可以水平滾動 --- */}
          <div className="flex-1 overflow-auto">
            <table className="w-full min-w-[1200px] text-sm text-left text-gray-500">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                <tr>
                  {/* --- 修正點：補上所有表頭欄位 --- */}
                  <th className="px-4 py-3">操作</th>
                  <th className="px-4 py-3">顧客姓名</th>
                  <th className="px-4 py-3">電訪人員</th>
                  <th className="px-4 py-3">電訪日期</th>
                  <th className="px-4 py-3">電話接通</th>
                  <th className="px-4 py-3">顧客反應</th>
                  <th className="px-4 py-3">回訪意願</th>
                  <th className="px-4 py-3">需求備註</th>
                  <th className="px-4 py-3">推薦方案</th>
                  <th className="px-4 py-3">需追蹤</th>
                  <th className="px-4 py-3">下次聯繫</th>
                  <th className="px-4 py-3">備註</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (<tr><td colSpan={12} className="text-center p-4">載入中...</td></tr>) 
                : (customers.map((customer) => (
                    <tr key={customer.id} className="bg-white border-b hover:bg-gray-50">
                      {/* --- 修正點：補上所有資料欄位 --- */}
                      <td className="px-4 py-4 flex gap-4">
                        <button onClick={() => openEditModal(customer)} className="font-medium text-blue-600 hover:underline">編輯</button>
                        <button onClick={() => handleDeleteCustomer(customer.id)} className="font-medium text-red-600 hover:underline">刪除</button>
                      </td>
                      <td className="px-4 py-4 font-medium text-gray-900 whitespace-nowrap">{customer.customer_name}</td>
                      <td className="px-4 py-4">{customer.caller_name}</td>
                      <td className="px-4 py-4">{customer.call_date}</td>
                      <td className="px-4 py-4">{customer.call_connected ? '✅' : '❌'}</td>
                      <td className="px-4 py-4">{customer.reaction_type}</td>
                      <td className="px-4 py-4">{customer.revisit_intention ? '✅' : '❌'}</td>
                      <td className="px-4 py-4 min-w-[200px] whitespace-pre-wrap">{customer.needs_notes}</td>
                      <td className="px-4 py-4">{customer.recommended_plan}</td>
                      <td className="px-4 py-4">{customer.follow_up_needed ? '✅' : '❌'}</td>
                      <td className="px-4 py-4">{customer.next_call_date}</td>
                      <td className="px-4 py-4 min-w-[200px] whitespace-pre-wrap">{customer.remarks}</td>
                    </tr>
                )))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 新增/編輯客戶的彈出式視窗 (維持不變) */}
      {isFormModalOpen && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
           <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-3xl">
            <h2 className="text-2xl font-semibold mb-6">{editingCustomer ? '編輯客戶資料' : '新增客戶資料'}</h2>
            <form onSubmit={handleFormSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto pr-4">
                <input name="customer_name" value={formData.customer_name || ''} onChange={handleFormChange} placeholder="顧客姓名" className="w-full p-2 border rounded" />
                <input name="caller_name" value={formData.caller_name || ''} onChange={handleFormChange} placeholder="電訪人員" className="w-full p-2 border rounded" />
                <div>
                  <label className="text-sm text-gray-600">電訪日期</label>
                  <input name="call_date" type="date" value={formData.call_date || ''} onChange={handleFormChange} className="w-full p-2 border rounded" />
                </div>
                <div>
                  <label className="text-sm text-gray-600">預計回電日期</label>
                  <input name="next_call_date" type="date" value={formData.next_call_date || ''} onChange={handleFormChange} className="w-full p-2 border rounded" />
                </div>
                <input name="reaction_type" value={formData.reaction_type || ''} onChange={handleFormChange} placeholder="顧客反應類型 (例如: 感興趣)" className="w-full p-2 border rounded" />
                <input name="recommended_plan" value={formData.recommended_plan || ''} onChange={handleFormChange} placeholder="推薦方案" className="w-full p-2 border rounded" />
                <textarea name="needs_notes" value={formData.needs_notes || ''} onChange={handleFormChange} placeholder="需求備註" className="w-full p-2 border rounded md:col-span-2" rows={3}></textarea>
                <textarea name="remarks" value={formData.remarks || ''} onChange={handleFormChange} placeholder="備註" className="w-full p-2 border rounded md:col-span-2" rows={2}></textarea>
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center"><input name="call_connected" id="call_connected" type="checkbox" checked={formData.call_connected || false} onChange={handleFormChange} className="h-4 w-4 rounded mr-2" /><label htmlFor="call_connected">電話是否接通</label></div>
                  <div className="flex items-center"><input name="revisit_intention" id="revisit_intention" type="checkbox" checked={formData.revisit_intention || false} onChange={handleFormChange} className="h-4 w-4 rounded mr-2" /><label htmlFor="revisit_intention">近期有回訪意願</label></div>
                  <div className="flex items-center"><input name="follow_up_needed" id="follow_up_needed" type="checkbox" checked={formData.follow_up_needed || false} onChange={handleFormChange} className="h-4 w-4 rounded mr-2" /><label htmlFor="follow_up_needed">需要後續追蹤</label></div>
                </div>
              </div>
              <div className="mt-8 flex justify-end gap-4">
                <button type="button" onClick={() => setIsFormModalOpen(false)} className="px-6 py-2 bg-gray-200 rounded-md">取消</button>
                <button type="submit" className="px-6 py-2 bg-blue-600 text-white rounded-md">{editingCustomer ? '儲存變更' : '確認新增'}</button>
              </div>
            </form>
           </div>
         </div>
      )}

      {/* CSV 上傳的彈出式視窗 (維持不變) */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
           <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-lg">
             <h2 className="text-2xl font-semibold mb-4">上傳 POS 客戶資料</h2>
             <p className="text-gray-600 mb-6">請選擇包含客戶電訪紀錄的 CSV 檔案。</p>
             <div className="space-y-4">
               <input type="file" accept=".csv" onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"/>
               {uploadFile && <p className="text-sm">已選擇檔案：<b>{uploadFile.name}</b></p>}
             </div>
             <div className="mt-8 flex justify-end gap-4">
               <button type="button" onClick={() => setIsUploadModalOpen(false)} className="px-6 py-2 bg-gray-300 rounded-md" disabled={isUploading}>取消</button>
               <button type="button" onClick={handleUpload} className="px-6 py-2 bg-green-600 text-white rounded-md disabled:bg-gray-400" disabled={isUploading || !uploadFile}>{isUploading ? '上傳中...' : '開始上傳'}</button>
             </div>
           </div>
        </div>
      )}
    </>
  );
}