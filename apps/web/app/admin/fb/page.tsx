'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { CatalogItem, DietaryTag, MenuCategory } from '@hotel-qr/supabase/types'

const DIETARY_OPTIONS: DietaryTag[] = ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'HALAL', 'NUT_FREE', 'DAIRY_FREE']

const DEFAULT_CATEGORY_DEFS: Array<{ name: string; icon: string; sort_order: number }> = [
  { name: 'Breakfast', icon: '🍳', sort_order: 1 },
  { name: 'Starters',  icon: '🥗', sort_order: 2 },
  { name: 'Mains',     icon: '🥩', sort_order: 3 },
  { name: 'Desserts',  icon: '🍰', sort_order: 4 },
  { name: 'Drinks',    icon: '🍹', sort_order: 5 },
  { name: 'Other',     icon: '🍽️', sort_order: 99 },
]

const TAG_COLORS: Record<string, string> = {
  VEGETARIAN: '#22c55e',
  VEGAN:       '#16a34a',
  GLUTEN_FREE: '#eab308',
  HALAL:       '#3b82f6',
  NUT_FREE:    '#f97316',
  DAIRY_FREE:  '#a855f7',
}

interface ParsedImportItem {
  id?: string
  name: string
  category: string
  price: number
  description: string
  dietary_tags: string[]
  sort_order: number
  is_available: boolean
  image_url?: string
  isValid: boolean
  errors: string[]
  isExisting: boolean
}

export default function AdminFBPage() {
  const HOTEL_ID = '00000000-0000-0000-0000-000000000001'

  const [items, setItems]                       = useState<CatalogItem[]>([])
  const [categories, setCategories]             = useState<MenuCategory[]>([])
  const [loading, setLoading]                   = useState(true)
  const [showForm, setShowForm]                 = useState(false)
  const [editingItem, setEditingItem]           = useState<CatalogItem | null>(null)
  const [saving, setSaving]                     = useState(false)
  const [toastMsg, setToastMsg]                 = useState<string | null>(null)
  const [searchQuery, setSearchQuery]           = useState('')
  const [selectedFilterCategory, setSelectedFilterCategory] = useState<string>('ALL')

  // Category Manager State
  const [showCatManager, setShowCatManager]     = useState(false)
  const [editingCategory, setEditingCategory]   = useState<MenuCategory | null>(null)
  const [catNameInput, setCatNameInput]         = useState('')
  const [catIconInput, setCatIconInput]         = useState('🍽️')
  const [catSortInput, setCatSortInput]         = useState('1')
  const [savingCat, setSavingCat]               = useState(false)

  // Item Form State
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    category: 'Mains',
    duration_mins: '',
    dietary_tags: [] as DietaryTag[],
    sort_order: '0',
    image_url: '',
  })
  const [imageFile, setImageFile]               = useState<File | null>(null)
  const [imagePreview, setImagePreview]         = useState<string>('')
  const [uploadingImage, setUploadingImage]     = useState(false)
  const fileInputRef                            = useRef<HTMLInputElement>(null)

  // Batch Import Modal State
  const [showImportModal, setShowImportModal]   = useState(false)
  const [importFile, setImportFile]             = useState<File | null>(null)
  const [parsedItems, setParsedItems]           = useState<ParsedImportItem[]>([])
  const [isImporting, setIsImporting]           = useState(false)
  const [importStats, setImportStats]           = useState<{ created: number; updated: number; failed: number } | null>(null)
  const importFileInputRef                      = useRef<HTMLInputElement>(null)

  const toast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3500)
  }

  // ── Fetch Categories & Items ──────────────────────────────────────────
  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('menu_categories')
        .select('*')
        .eq('hotel_id', HOTEL_ID)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (!error && data && data.length > 0) {
        setCategories(data as MenuCategory[])
        return data as MenuCategory[]
      }
    } catch (e) {
      console.warn('[AdminFB] menu_categories table lookup fallback:', e)
    }

    // Fallback if table is not yet seeded
    const fallbackCats: MenuCategory[] = DEFAULT_CATEGORY_DEFS.map((d, i) => ({
      id: `fallback-cat-${i}`,
      hotel_id: HOTEL_ID,
      name: d.name,
      icon: d.icon,
      sort_order: d.sort_order,
      is_active: true,
      created_at: new Date().toISOString(),
    }))
    setCategories(fallbackCats)
    return fallbackCats
  }, [HOTEL_ID])

  const fetchItems = useCallback(async () => {
    setLoading(true)
    const { data } = await (supabase as any)
      .from('catalog_items')
      .select('*')
      .eq('hotel_id', HOTEL_ID)
      .eq('department', 'F_AND_B')
      .order('category')
      .order('sort_order')

    const catalog = (data ?? []) as CatalogItem[]
    setItems(catalog)

    const loadedCats = await fetchCategories()

    // Ensure any unique category present in items is also represented in list
    const existingCatNames = new Set(loadedCats.map(c => c.name.toLowerCase()))
    const dynamicCats: MenuCategory[] = [...loadedCats]
    catalog.forEach(item => {
      if (item.category && !existingCatNames.has(item.category.toLowerCase())) {
        existingCatNames.add(item.category.toLowerCase())
        dynamicCats.push({
          id: `item-cat-${item.category}`,
          hotel_id: HOTEL_ID,
          name: item.category,
          icon: '🍽️',
          sort_order: 50,
          is_active: true,
          created_at: new Date().toISOString(),
        })
      }
    })
    setCategories(dynamicCats)
    setLoading(false)
  }, [HOTEL_ID, fetchCategories])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  // Realtime Subscriptions
  useEffect(() => {
    const ch = supabase
      .channel('admin-fnb-catalog-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'catalog_items' }, fetchItems)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_categories' }, fetchCategories)
      .subscribe()
    return () => {
      supabase.removeChannel(ch)
    }
  }, [fetchItems, fetchCategories])

  // ── Image Upload Helper ────────────────────────────────────────────────
  const compressImage = async (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          const MAX_WIDTH = 480
          const MAX_HEIGHT = 480
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width)
              width = MAX_WIDTH
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height)
              height = MAX_HEIGHT
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height)
            resolve(canvas.toDataURL('image/jpeg', 0.85))
          } else {
            resolve(e.target?.result as string)
          }
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    })
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageFile(file)
    setUploadingImage(true)
    try {
      const compressedDataUrl = await compressImage(file)
      setImagePreview(compressedDataUrl)

      // Try uploading to Supabase Storage bucket 'food-images'
      const fileExt = file.name.split('.').pop() || 'jpg'
      const fileName = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('food-images')
        .upload(fileName, file, { upsert: true, contentType: file.type })

      if (!uploadError && uploadData?.path) {
        const { data: publicUrlData } = supabase.storage.from('food-images').getPublicUrl(uploadData.path)
        setForm(f => ({ ...f, image_url: publicUrlData.publicUrl }))
      } else {
        // Fallback directly to compressed Data URL so image always displays
        setForm(f => ({ ...f, image_url: compressedDataUrl }))
      }
    } catch (err) {
      console.warn('[AdminFB] Image processing fallback to direct URL:', err)
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        setImagePreview(result)
        setForm(f => ({ ...f, image_url: result }))
      }
      reader.readAsDataURL(file)
    } finally {
      setUploadingImage(false)
    }
  }

  const handleRemoveImage = () => {
    setImageFile(null)
    setImagePreview('')
    setForm(f => ({ ...f, image_url: '' }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Availability Toggle ────────────────────────────────────────────────
  const toggleAvailability = async (item: CatalogItem) => {
    await (supabase as any)
      .from('catalog_items')
      .update({ is_available: !item.is_available })
      .eq('id', item.id)

    // Mirror to menu_catalog if exists
    try {
      await (supabase as any)
        .from('menu_catalog')
        .update({ is_available: !item.is_available })
        .eq('name', item.name)
    } catch (e) {
      // non-fatal
    }

    toast(item.is_available ? `"${item.name}" marked 86'd (Out of Stock)` : `"${item.name}" restored to available`)
  }

  // ── Item Form Handling ────────────────────────────────────────────────
  const handleStartEdit = (item: CatalogItem) => {
    setEditingItem(item)
    setForm({
      name: item.name,
      description: item.description || '',
      price: String(item.price),
      category: item.category || (categories[0]?.name ?? 'Mains'),
      duration_mins: item.duration_mins ? String(item.duration_mins) : '',
      dietary_tags: (item.dietary_tags || []) as DietaryTag[],
      sort_order: String(item.sort_order || 0),
      image_url: item.image_url || '',
    })
    setImagePreview(item.image_url || '')
    setImageFile(null)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingItem(null)
    setForm({
      name: '',
      description: '',
      price: '',
      category: categories[0]?.name ?? 'Mains',
      duration_mins: '',
      dietary_tags: [],
      sort_order: '0',
      image_url: '',
    })
    setImageFile(null)
    setImagePreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.price.trim()) {
      toast('Please provide a valid item name and price.')
      return
    }

    setSaving(true)
    const payload = {
      hotel_id: HOTEL_ID,
      department: 'F_AND_B',
      category: form.category.trim() || 'Mains',
      name: form.name.trim(),
      description: form.description.trim() || null,
      price: parseFloat(form.price) || 0,
      duration_mins: form.duration_mins ? parseInt(form.duration_mins) : null,
      dietary_tags: form.dietary_tags,
      sort_order: parseInt(form.sort_order) || 0,
      is_available: true,
      requires_on_call: false,
      image_url: form.image_url.trim() || null,
    }

    const q = (supabase as any).from('catalog_items')
    const { error } = editingItem
      ? await q.update(payload).eq('id', editingItem.id)
      : await q.insert(payload)

    // Mirror to menu_catalog if present
    try {
      const mcPayload = {
        hotel_id: HOTEL_ID,
        name: payload.name,
        description: payload.description,
        price: payload.price,
        category: payload.category,
        dietary_tags: payload.dietary_tags,
        sort_order: payload.sort_order,
        is_available: true,
        image_url: payload.image_url,
      }
      await (supabase as any).from('menu_catalog').upsert(mcPayload, { onConflict: 'hotel_id, name' })
    } catch (e) {
      // non-fatal
    }

    setSaving(false)
    if (!error) {
      handleCancelForm()
      fetchItems()
      toast(editingItem ? `Updated "${payload.name}"` : `Added "${payload.name}" to menu`)
    } else {
      toast(`Error saving item: ${error.message || 'Check database connection'}`)
    }
  }

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to permanently delete "${name}" from the menu?`)) return
    await (supabase as any).from('catalog_items').delete().eq('id', id)
    try {
      await (supabase as any).from('menu_catalog').delete().eq('name', name)
    } catch (e) {
      // non-fatal
    }
    fetchItems()
    toast(`"${name}" deleted from menu`)
  }

  const toggleDietaryTag = (tag: DietaryTag) => {
    setForm(f => ({
      ...f,
      dietary_tags: f.dietary_tags.includes(tag)
        ? f.dietary_tags.filter(t => t !== tag)
        : [...f.dietary_tags, tag],
    }))
  }

  // ── Category CRUD Operations ──────────────────────────────────────────
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catNameInput.trim()) return

    setSavingCat(true)
    const catName = catNameInput.trim()
    const icon = catIconInput.trim() || '🍽️'
    const sortOrder = parseInt(catSortInput) || 1

    try {
      if (editingCategory) {
        const oldName = editingCategory.name
        // Update category in DB
        await (supabase as any)
          .from('menu_categories')
          .update({ name: catName, icon, sort_order: sortOrder, updated_at: new Date().toISOString() })
          .eq('hotel_id', HOTEL_ID)
          .eq('name', oldName)

        // If category name changed, cascade update items in that category
        if (oldName !== catName) {
          await (supabase as any)
            .from('catalog_items')
            .update({ category: catName })
            .eq('hotel_id', HOTEL_ID)
            .eq('category', oldName)
          toast(`Category renamed to "${catName}" and items updated`)
        } else {
          toast(`Category "${catName}" updated`)
        }
      } else {
        // Insert new category
        await (supabase as any)
          .from('menu_categories')
          .insert([{ hotel_id: HOTEL_ID, name: catName, icon, sort_order: sortOrder, is_active: true }])
        toast(`Category "${catName}" created`)
      }
    } catch (err: any) {
      console.warn('[AdminFB] Category save fallback to state:', err)
      toast(`Category "${catName}" saved`)
    }

    setSavingCat(false)
    setCatNameInput('')
    setCatIconInput('🍽️')
    setCatSortInput('1')
    setEditingCategory(null)
    await fetchItems()
  }

  const handleStartEditCategory = (cat: MenuCategory) => {
    setEditingCategory(cat)
    setCatNameInput(cat.name)
    setCatIconInput(cat.icon || '🍽️')
    setCatSortInput(String(cat.sort_order || 1))
  }

  const handleCancelCategoryEdit = () => {
    setEditingCategory(null)
    setCatNameInput('')
    setCatIconInput('🍽️')
    setCatSortInput('1')
  }

  const handleDeleteCategory = async (cat: MenuCategory) => {
    const itemsInCat = items.filter(i => (i.category || '').toLowerCase() === cat.name.toLowerCase())
    const confirmPrompt = itemsInCat.length > 0
      ? `Category "${cat.name}" has ${itemsInCat.length} menu items. Deleting it will reassign these items to "Other". Proceed?`
      : `Are you sure you want to delete category "${cat.name}"?`

    if (!confirm(confirmPrompt)) return

    try {
      await (supabase as any)
        .from('menu_categories')
        .delete()
        .eq('hotel_id', HOTEL_ID)
        .eq('name', cat.name)

      // Reassign items to Other
      if (itemsInCat.length > 0) {
        await (supabase as any)
          .from('catalog_items')
          .update({ category: 'Other' })
          .eq('hotel_id', HOTEL_ID)
          .eq('category', cat.name)
      }
      toast(`Category "${cat.name}" deleted`)
    } catch (err) {
      console.warn('[AdminFB] Category delete error:', err)
    }

    await fetchItems()
  }

  // ── CSV Export Function ───────────────────────────────────────────────
  const handleExportCSV = () => {
    if (items.length === 0) {
      toast('No menu items to export.')
      return
    }

    const headers = ['Name', 'Category', 'Price', 'Description', 'Dietary Tags', 'Sort Order', 'Available', 'Image URL']
    const rows = items.map(item => [
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.category || 'Mains').replace(/"/g, '""')}"`,
      Number(item.price || 0).toFixed(2),
      `"${(item.description || '').replace(/"/g, '""')}"`,
      `"${(item.dietary_tags || []).join(';')}"`,
      item.sort_order || 0,
      item.is_available ? 'TRUE' : 'FALSE',
      `"${(item.image_url || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const today = new Date().toISOString().split('T')[0]
    link.setAttribute('download', `menu_catalog_export_${today}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast('Menu catalog exported to CSV')
  }

  // ── CSV Template Download ─────────────────────────────────────────────
  const handleDownloadTemplate = () => {
    const headers = ['Name', 'Category', 'Price', 'Description', 'Dietary Tags', 'Sort Order', 'Available', 'Image URL']
    const sampleRows = [
      ['Classic Eggs Benedict', 'Breakfast', '22.00', 'Two poached eggs on English muffins with Canadian bacon', '', '1', 'TRUE', 'https://images.unsplash.com/photo-1608039829572-78524f79c4c7?w=300'],
      ['Avocado Toast', 'Breakfast', '18.00', 'Smashed avocado on sourdough with cherry tomatoes and feta', 'VEGETARIAN', '2', 'TRUE', 'https://images.unsplash.com/photo-1588137378633-dea1336ce1e2?w=300'],
      ['Grilled Wagyu Burger', 'Mains', '38.00', 'A5 wagyu beef patty, truffle aioli, aged cheddar with fries', '', '10', 'TRUE', 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=300'],
      ['Truffle Risotto', 'Mains', '34.00', 'Carnaroli rice, black truffle, parmesan crisp and micro herbs', 'VEGETARIAN;GLUTEN_FREE', '12', 'TRUE', 'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=300'],
      ['Warm Chocolate Fondant', 'Desserts', '18.00', 'Dark chocolate lava cake with vanilla bean ice cream', 'VEGETARIAN', '30', 'TRUE', 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=300'],
      ['Fresh Pressed Orange Juice', 'Drinks', '12.00', '100% freshly squeezed Valencia oranges', 'VEGAN;GLUTEN_FREE', '40', 'TRUE', 'https://images.unsplash.com/photo-1613478223719-2ab802602423?w=300'],
    ]

    const csvContent = [headers.join(','), ...sampleRows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'menu_import_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast('Download started: menu_import_template.csv')
  }

  // ── CSV Parser for Batch Import ───────────────────────────────────────
  const parseCSVText = (text: string): string[][] => {
    const lines: string[][] = []
    let currentRow: string[] = []
    let currentCell = ''
    let insideQuote = false

    for (let i = 0; i < text.length; i++) {
      const char = text[i]
      const nextChar = text[i + 1]

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          currentCell += '"'
          i++ // skip escaped quote
        } else {
          insideQuote = !insideQuote
        }
      } else if (char === ',' && !insideQuote) {
        currentRow.push(currentCell.trim())
        currentCell = ''
      } else if ((char === '\r' || char === '\n') && !insideQuote) {
        if (char === '\r' && nextChar === '\n') i++
        currentRow.push(currentCell.trim())
        if (currentRow.some(c => c.length > 0)) {
          lines.push(currentRow)
        }
        currentRow = []
        currentCell = ''
      } else {
        currentCell += char
      }
    }
    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell.trim())
      if (currentRow.some(c => c.length > 0)) lines.push(currentRow)
    }
    return lines
  }

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const rows = parseCSVText(text)
      if (rows.length < 2) {
        toast('CSV file is empty or missing data rows.')
        return
      }

      const headers = rows[0].map(h => h.toLowerCase().replace(/[\s_-]/g, ''))
      const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('item'))
      const catIdx  = headers.findIndex(h => h.includes('cat'))
      const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('cost'))
      const descIdx = headers.findIndex(h => h.includes('desc'))
      const tagsIdx = headers.findIndex(h => h.includes('tag') || h.includes('diet'))
      const sortIdx = headers.findIndex(h => h.includes('sort') || h.includes('order'))
      const availIdx = headers.findIndex(h => h.includes('avail') || h.includes('status'))
      const imgIdx = headers.findIndex(h => h.includes('image') || h.includes('photo') || h.includes('url'))

      const existingNamesMap = new Map<string, CatalogItem>()
      items.forEach(i => existingNamesMap.set(i.name.trim().toLowerCase(), i))

      const parsed: ParsedImportItem[] = []

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0 || row.every(c => !c)) continue

        const name = (nameIdx !== -1 ? row[nameIdx] : row[0]) || ''
        const category = (catIdx !== -1 ? row[catIdx] : row[1]) || 'Mains'
        const rawPrice = (priceIdx !== -1 ? row[priceIdx] : row[2]) || '0'
        const description = (descIdx !== -1 ? row[descIdx] : row[3]) || ''
        const rawTags = (tagsIdx !== -1 ? row[tagsIdx] : row[4]) || ''
        const rawSort = (sortIdx !== -1 ? row[sortIdx] : row[5]) || '0'
        const rawAvail = (availIdx !== -1 ? row[availIdx] : row[6]) || 'TRUE'
        const imageUrl = (imgIdx !== -1 ? row[imgIdx] : row[7]) || ''

        const price = parseFloat(rawPrice.replace(/[^0-9.]/g, ''))
        const errors: string[] = []

        if (!name.trim()) errors.push('Missing item name')
        if (isNaN(price) || price < 0) errors.push('Invalid price')

        const dietary_tags = rawTags
          .split(/[;,]/)
          .map(t => t.trim().toUpperCase().replace(/[\s-]/g, '_'))
          .filter(t => DIETARY_OPTIONS.includes(t as DietaryTag))

        const existingItem = existingNamesMap.get(name.trim().toLowerCase())

        parsed.push({
          id: existingItem?.id,
          name: name.trim(),
          category: category.trim() || 'Mains',
          price: isNaN(price) ? 0 : price,
          description: description.trim(),
          dietary_tags,
          sort_order: parseInt(rawSort) || 0,
          is_available: !['false', '0', 'no', '86'].includes(rawAvail.toLowerCase()),
          image_url: imageUrl.trim() || undefined,
          isValid: errors.length === 0,
          errors,
          isExisting: Boolean(existingItem),
        })
      }

      setParsedItems(parsed)
      setImportStats(null)
    }
    reader.readAsText(file)
  }

  const handleExecuteBatchImport = async () => {
    const validItems = parsedItems.filter(p => p.isValid)
    if (validItems.length === 0) {
      toast('No valid items found in CSV.')
      return
    }

    setIsImporting(true)
    let createdCount = 0
    let updatedCount = 0
    let failedCount = 0

    // Auto-create any missing categories
    const distinctCategories = Array.from(new Set(validItems.map(v => v.category)))
    for (const catName of distinctCategories) {
      if (!categories.some(c => c.name.toLowerCase() === catName.toLowerCase())) {
        try {
          await (supabase as any)
            .from('menu_categories')
            .insert([{ hotel_id: HOTEL_ID, name: catName, icon: '🍽️', sort_order: 50, is_active: true }])
        } catch (e) {
          // ignore duplicate
        }
      }
    }

    for (const item of validItems) {
      const payload: any = {
        hotel_id: HOTEL_ID,
        department: 'F_AND_B',
        category: item.category,
        name: item.name,
        description: item.description || null,
        price: item.price,
        dietary_tags: item.dietary_tags,
        sort_order: item.sort_order,
        is_available: item.is_available,
        image_url: item.image_url || null,
        requires_on_call: false,
      }

      try {
        if (item.id) {
          // Update existing item
          const { error } = await (supabase as any).from('catalog_items').update(payload).eq('id', item.id)
          if (error) failedCount++
          else updatedCount++
        } else {
          // Insert new item
          const { error } = await (supabase as any).from('catalog_items').insert(payload)
          if (error) failedCount++
          else createdCount++
        }

        // Mirror to menu_catalog if available
        try {
          await (supabase as any).from('menu_catalog').upsert({
            hotel_id: HOTEL_ID,
            name: payload.name,
            description: payload.description,
            price: payload.price,
            category: payload.category,
            dietary_tags: payload.dietary_tags,
            sort_order: payload.sort_order,
            is_available: payload.is_available,
            image_url: payload.image_url,
          }, { onConflict: 'hotel_id, name' })
        } catch (mcErr) {
          // non-fatal
        }
      } catch (err) {
        failedCount++
      }
    }

    setIsImporting(false)
    setImportStats({ created: createdCount, updated: updatedCount, failed: failedCount })
    fetchItems()
    toast(`Batch import complete: ${createdCount} created, ${updatedCount} updated${failedCount > 0 ? `, ${failedCount} failed` : ''}`)
  }

  // ── Filtered & Grouped Items ──────────────────────────────────────────
  const filteredItems = items.filter(item => {
    const matchesSearch = searchQuery === '' ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCat = selectedFilterCategory === 'ALL' || (item.category || 'Other') === selectedFilterCategory
    return matchesSearch && matchesCat
  })

  const grouped = filteredItems.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category ?? 'Other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  const totalItemsCount = items.length
  const availableCount  = items.filter(i => i.is_available).length
  const outOfStockCount = totalItemsCount - availableCount

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #090a10 0%, #0e111a 50%, #090a10 100%)', color: '#fff', padding: '24px', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* Floating Toast Notification */}
      {toastMsg && (
        <div style={{ position: 'fixed', top: 24, right: 24, zIndex: 9999, background: 'rgba(249, 115, 22, 0.2)', border: '1px solid rgba(249, 115, 22, 0.5)', color: '#fed7aa', padding: '14px 22px', borderRadius: 14, backdropFilter: 'blur(16px)', fontWeight: 600, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeIn 0.2s ease-out' }}>
          <span>✨</span>
          <span>{toastMsg}</span>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Top Header Navigation ──────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <a href="/admin" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                ← Admin Hub
              </a>
              <span style={{ color: '#334155' }}>/</span>
              <span style={{ color: '#f97316', fontSize: 13, fontWeight: 600 }}>Food &amp; Beverage Control</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 900, color: '#ffffff', margin: 0, letterSpacing: '-0.8px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>🍽️</span> F&amp;B Kitchen &amp; Bar Menu
            </h1>
            <p style={{ color: 'rgba(255,255,255,0.55)', margin: '6px 0 0', fontSize: 14, maxWidth: 600 }}>
              Manage full menu categories, food photo thumbnails, availability status, CSV batch imports, and real-time pricing.
            </p>
          </div>

          {/* Action Button Bar */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => setShowCatManager(true)}
              style={secondaryBtnStyle}
              title="Manage and reorder menu categories"
            >
              📁 Manage Categories ({categories.length})
            </button>

            <button
              onClick={handleExportCSV}
              style={secondaryBtnStyle}
              title="Download entire menu as CSV"
            >
              📥 Export CSV
            </button>

            <button
              onClick={() => {
                setShowImportModal(true)
                setImportFile(null)
                setParsedItems([])
                setImportStats(null)
              }}
              style={secondaryBtnStyle}
              title="Batch import or update menu items via CSV"
            >
              📤 Batch Import
            </button>

            <button
              onClick={handleDownloadTemplate}
              style={{ ...secondaryBtnStyle, background: 'rgba(249, 115, 22, 0.08)', borderColor: 'rgba(249, 115, 22, 0.25)', color: '#fb923c' }}
              title="Download sample CSV template for import"
            >
              📄 CSV Template
            </button>

            <button
              id="btn-add-menu-item"
              onClick={() => {
                if (showForm) handleCancelForm()
                else {
                  setEditingItem(null)
                  setForm({
                    name: '',
                    description: '',
                    price: '',
                    category: categories[0]?.name ?? 'Mains',
                    duration_mins: '',
                    dietary_tags: [],
                    sort_order: String(items.length + 1),
                    image_url: '',
                  })
                  setImagePreview('')
                  setShowForm(true)
                }
              }}
              style={primaryBtnStyle}
            >
              {showForm ? '✕ Close Form' : '+ Add Menu Item'}
            </button>
          </div>
        </div>

        {/* ── KPI Stats Cards ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div style={kpiCardStyle}>
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Dishes</div>
            <div style={{ color: '#ffffff', fontSize: 28, fontWeight: 900, marginTop: 4 }}>{totalItemsCount}</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Across {categories.length} categories</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={{ color: 'rgba(34,197,94,0.7)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active on Menu</div>
            <div style={{ color: '#4ade80', fontSize: 28, fontWeight: 900, marginTop: 4 }}>{availableCount}</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Ready for guest ordering</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={{ color: 'rgba(239,68,68,0.7)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>86&apos;d / Out of Stock</div>
            <div style={{ color: '#f87171', fontSize: 28, fontWeight: 900, marginTop: 4 }}>{outOfStockCount}</div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>Hidden or disabled for guests</div>
          </div>
          <div style={kpiCardStyle}>
            <div style={{ color: 'rgba(249,115,22,0.7)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>With Photo Thumbnails</div>
            <div style={{ color: '#fb923c', fontSize: 28, fontWeight: 900, marginTop: 4 }}>
              {items.filter(i => Boolean(i.image_url)).length}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>High-converting visual cards</div>
          </div>
        </div>

        {/* ── Search & Category Filter Tabs ───────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <input
              type="text"
              placeholder="🔍 Search dishes by name, description, category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={inputStyle}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14 }}
              >
                ✕
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
            <button
              onClick={() => setSelectedFilterCategory('ALL')}
              style={{
                padding: '8px 16px',
                borderRadius: 12,
                border: `1px solid ${selectedFilterCategory === 'ALL' ? '#f97316' : 'rgba(255,255,255,0.12)'}`,
                background: selectedFilterCategory === 'ALL' ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)',
                color: selectedFilterCategory === 'ALL' ? '#f97316' : 'rgba(255,255,255,0.6)',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              All Dishes ({items.length})
            </button>
            {categories.map(cat => {
              const count = items.filter(i => (i.category || '').toLowerCase() === cat.name.toLowerCase()).length
              return (
                <button
                  key={cat.id || cat.name}
                  onClick={() => setSelectedFilterCategory(cat.name)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: 12,
                    border: `1px solid ${selectedFilterCategory === cat.name ? '#f97316' : 'rgba(255,255,255,0.12)'}`,
                    background: selectedFilterCategory === cat.name ? 'rgba(249,115,22,0.18)' : 'rgba(255,255,255,0.04)',
                    color: selectedFilterCategory === cat.name ? '#f97316' : 'rgba(255,255,255,0.6)',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s',
                  }}
                >
                  {cat.icon || '🍽️'} {cat.name} ({count})
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Add / Edit Item Form ────────────────────────────────────── */}
        {showForm && (
          <form onSubmit={handleSaveItem} style={{ background: 'rgba(20, 24, 38, 0.95)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 20, padding: 28, marginBottom: 32, backdropFilter: 'blur(20px)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 16 }}>
              <div>
                <h2 style={{ color: '#fff', margin: 0, fontWeight: 800, fontSize: 20 }}>
                  {editingItem ? `✏️ Edit Item: ${editingItem.name}` : '➕ Add New Menu Dish'}
                </h2>
                <p style={{ color: 'rgba(255,255,255,0.5)', margin: '4px 0 0', fontSize: 13 }}>
                  Configure pricing, categories, food photo thumbnail, and dietary preferences.
                </p>
              </div>
              <button type="button" onClick={handleCancelForm} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24, marginBottom: 20 }}>
              {/* Left Column: Basic Details */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Dish Name *</label>
                  <input
                    id="input-item-name"
                    required
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Pan-Seared Atlantic Salmon"
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Category *</label>
                    <select
                      id="select-category"
                      value={form.category}
                      onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      style={inputStyle}
                    >
                      {categories.map(c => (
                        <option key={c.id || c.name} value={c.name}>{c.icon || '🍽️'} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Price (₱) *</label>
                    <input
                      id="input-price"
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                      placeholder="e.g. 450.00"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Prep Time (Minutes)</label>
                    <input
                      id="input-duration"
                      type="number"
                      value={form.duration_mins}
                      onChange={e => setForm(f => ({ ...f, duration_mins: e.target.value }))}
                      placeholder="e.g. 20"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Sort Order</label>
                    <input
                      id="input-sort-order"
                      type="number"
                      value={form.sort_order}
                      onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                      placeholder="e.g. 1"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description &amp; Ingredients</label>
                  <textarea
                    id="input-description"
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Describe ingredients, cooking style, garnishes, and side servings..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Right Column: Thumbnail Upload & Preview */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Dish Photo Thumbnail</label>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(249, 115, 22, 0.4)', borderRadius: 16, padding: 20, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 220, position: 'relative' }}>
                    {imagePreview ? (
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ width: 140, height: 140, borderRadius: 16, overflow: 'hidden', border: '2px solid #f97316', marginBottom: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', position: 'relative' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={imagePreview} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(249,115,22,0.2)', border: '1px solid #f97316', color: '#fed7aa', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Change Image
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveImage}
                            style={{ padding: '6px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.2)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 38, marginBottom: 10 }}>📷</div>
                        <div style={{ color: '#ffffff', fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Upload Food Photo</div>
                        <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>PNG, JPG, or WebP (Auto-optimized)</div>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage}
                          style={{ padding: '8px 18px', borderRadius: 10, background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                        >
                          {uploadingImage ? 'Processing…' : 'Select Image File'}
                        </button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      style={{ display: 'none' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Or External Image URL</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.image_url}
                    onChange={e => {
                      setForm(f => ({ ...f, image_url: e.target.value }))
                      setImagePreview(e.target.value)
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>

            {/* Dietary Tags */}
            <div style={{ marginBottom: 24 }}>
              <label style={labelStyle}>Dietary Tags &amp; Allergen Badges</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                {DIETARY_OPTIONS.map(tag => (
                  <button
                    type="button"
                    key={tag}
                    id={`tag-${tag}`}
                    onClick={() => toggleDietaryTag(tag)}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 20,
                      border: `1px solid ${form.dietary_tags.includes(tag) ? TAG_COLORS[tag] : 'rgba(255,255,255,0.18)'}`,
                      background: form.dietary_tags.includes(tag) ? `${TAG_COLORS[tag]}25` : 'rgba(255,255,255,0.03)',
                      color: form.dietary_tags.includes(tag) ? TAG_COLORS[tag] : 'rgba(255,255,255,0.5)',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    {tag.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
              <button
                id="btn-save-item"
                type="submit"
                disabled={saving}
                style={{
                  background: 'linear-gradient(135deg, #f97316, #ea580c)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 12,
                  padding: '12px 36px',
                  fontWeight: 800,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                  fontSize: 15,
                  boxShadow: '0 4px 14px rgba(249,115,22,0.4)',
                }}
              >
                {saving ? 'Saving Item…' : editingItem ? 'Update Menu Item' : 'Add to Menu Catalog'}
              </button>
              <button
                type="button"
                onClick={handleCancelForm}
                style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 24px', fontWeight: 600, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* ── Menu Catalog Items Display ──────────────────────────────── */}
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 64 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🍳</div>
            Loading menu catalog…
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 20, padding: 64, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
            <h3 style={{ color: '#fff', fontSize: 18, margin: '0 0 8px' }}>No menu items found</h3>
            <p style={{ color: 'rgba(255,255,255,0.45)', margin: '0 0 20px', fontSize: 14 }}>
              {searchQuery || selectedFilterCategory !== 'ALL'
                ? 'Try adjusting your search query or category filter.'
                : 'Your menu catalog is empty. Click "+ Add Menu Item" or "Batch Import" to begin.'}
            </p>
            <button
              onClick={() => setShowForm(true)}
              style={primaryBtnStyle}
            >
              + Add Menu Item
            </button>
          </div>
        ) : (
          Object.entries(grouped).map(([cat, catItems]) => {
            const catDef = categories.find(c => c.name.toLowerCase() === cat.toLowerCase())
            return (
              <div key={cat} style={{ marginBottom: 36 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <h2 style={{ color: '#f97316', fontWeight: 800, fontSize: 16, margin: 0, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{catDef?.icon || '🍽️'}</span>
                    <span>{cat}</span>
                    <span style={{ background: 'rgba(249,115,22,0.15)', color: '#fb923c', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700 }}>
                      {catItems.length}
                    </span>
                  </h2>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      id={`menu-item-${item.id}`}
                      style={{
                        background: item.is_available ? 'rgba(255,255,255,0.035)' : 'rgba(239,68,68,0.06)',
                        border: `1px solid ${item.is_available ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.3)'}`,
                        borderRadius: 16,
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        opacity: item.is_available ? 1 : 0.65,
                        transition: 'all 0.25s ease',
                      }}
                    >
                      {/* Dish Thumbnail */}
                      <div style={{ width: 68, height: 68, borderRadius: 12, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {item.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.image_url}
                            alt={item.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => {
                              // fallback on broken image url
                              (e.target as HTMLElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: 26, opacity: 0.6 }}>{catDef?.icon || '🍽️'}</span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 16 }}>{item.name}</span>
                          {!item.is_available && (
                            <span style={{ background: 'rgba(239,68,68,0.2)', color: '#f87171', fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                              86&apos;d (Out of Stock)
                            </span>
                          )}
                          {item.duration_mins && (
                            <span style={{ color: '#94a3b8', fontSize: 12 }}>
                              ⏱️ {item.duration_mins} min
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p style={{ color: 'rgba(255,255,255,0.5)', margin: '0 0 6px', fontSize: 13, lineHeight: 1.4 }}>
                            {item.description}
                          </p>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {(item.dietary_tags ?? []).map(tag => (
                            <span
                              key={tag}
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 10,
                                background: `${TAG_COLORS[tag as DietaryTag]}22`,
                                color: TAG_COLORS[tag as DietaryTag],
                                fontWeight: 600,
                              }}
                            >
                              {tag.replace('_', ' ')}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Price */}
                      <div style={{ color: '#f97316', fontWeight: 900, fontSize: 19, minWidth: 90, textAlign: 'right' }}>
                        ₱{Number(item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>

                      {/* Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          onClick={() => handleStartEdit(item)}
                          style={{ padding: '7px 14px', borderRadius: 9, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item.id, item.name)}
                          style={{ padding: '7px 14px', borderRadius: 9, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                        <button
                          id={`toggle-${item.id}`}
                          onClick={() => toggleAvailability(item)}
                          title={item.is_available ? "Mark 86'd (Out of Stock)" : 'Mark Available'}
                          style={{
                            width: 54,
                            height: 30,
                            borderRadius: 15,
                            border: 'none',
                            cursor: 'pointer',
                            background: item.is_available ? '#22c55e' : '#ef4444',
                            position: 'relative',
                            transition: 'background 0.3s',
                            flexShrink: 0,
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: 3,
                              left: item.is_available ? 27 : 3,
                              width: 24,
                              height: 24,
                              borderRadius: '50%',
                              background: '#fff',
                              transition: 'left 0.25s ease',
                              boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
                            }}
                          />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Category Manager Modal ────────────────────────────────────── */}
      {showCatManager && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, maxWidth: 640 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>📁 Menu Category Manager</h3>
                <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: 13 }}>Create, rename, reorder, or delete food &amp; beverage categories.</p>
              </div>
              <button onClick={() => { setShowCatManager(false); handleCancelCategoryEdit() }} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Add / Edit Category Form */}
            <form onSubmit={handleSaveCategory} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 18, marginBottom: 22 }}>
              <div style={{ color: '#f97316', fontWeight: 700, fontSize: 13, marginBottom: 12, textTransform: 'uppercase' }}>
                {editingCategory ? `✏️ Edit Category: ${editingCategory.name}` : '➕ Add New Category'}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>Icon</label>
                  <input
                    value={catIconInput}
                    onChange={e => setCatIconInput(e.target.value)}
                    placeholder="🍳"
                    style={{ ...inputStyle, textAlign: 'center', fontSize: 18 }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Category Name *</label>
                  <input
                    required
                    value={catNameInput}
                    onChange={e => setCatNameInput(e.target.value)}
                    placeholder="e.g. Signature Cocktails"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Order</label>
                  <input
                    type="number"
                    value={catSortInput}
                    onChange={e => setCatSortInput(e.target.value)}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="submit"
                  disabled={savingCat}
                  style={{ padding: '8px 20px', borderRadius: 10, background: '#f97316', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  {savingCat ? 'Saving…' : editingCategory ? 'Save Category' : '+ Add Category'}
                </button>
                {editingCategory && (
                  <button
                    type="button"
                    onClick={handleCancelCategoryEdit}
                    style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontSize: 13, cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>

            {/* Existing Categories List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {categories.map(cat => {
                const count = items.filter(i => (i.category || '').toLowerCase() === cat.name.toLowerCase()).length
                return (
                  <div
                    key={cat.id || cat.name}
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 22 }}>{cat.icon || '🍽️'}</span>
                      <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{cat.name}</div>
                        <div style={{ color: '#64748b', fontSize: 11 }}>Order: {cat.sort_order ?? 1} · {count} dish(es)</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => handleStartEditCategory(cat)}
                        style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', color: '#a5b4fc', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(cat)}
                        style={{ padding: '5px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Batch Import Modal ────────────────────────────────────────── */}
      {showImportModal && (
        <div style={modalOverlayStyle}>
          <div style={{ ...modalCardStyle, maxWidth: 840 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 14 }}>
              <div>
                <h3 style={{ color: '#fff', margin: 0, fontSize: 20, fontWeight: 800 }}>📤 Batch Import Menu (CSV)</h3>
                <p style={{ color: '#94a3b8', margin: '4px 0 0', fontSize: 13 }}>Upload a CSV file to bulk add or update dishes in the menu catalog.</p>
              </div>
              <button onClick={() => setShowImportModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>✕</button>
            </div>

            {/* Drag and Drop / File Input Box */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '2px dashed rgba(249,115,22,0.4)', borderRadius: 16, padding: 24, textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Select Menu CSV File</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 14 }}>
                {importFile ? `Selected: ${importFile.name} (${(importFile.size / 1024).toFixed(1)} KB)` : 'Format: Name, Category, Price, Description, Dietary Tags, Sort Order, Available, Image URL'}
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  style={{ padding: '8px 20px', borderRadius: 10, background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Browse File
                </button>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  style={{ padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.3)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                >
                  Download Template
                </button>
              </div>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportFileSelect}
                style={{ display: 'none' }}
              />
            </div>

            {/* Parsed Preview Table */}
            {parsedItems.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>
                    Preview: {parsedItems.length} items parsed ({parsedItems.filter(p => p.isValid).length} valid, {parsedItems.filter(p => !p.isValid).length} invalid)
                  </div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>
                    {parsedItems.filter(p => p.isExisting).length} updates, {parsedItems.filter(p => !p.isExisting && p.isValid).length} new dishes
                  </div>
                </div>

                <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ padding: '8px 12px' }}>Action</th>
                        <th style={{ padding: '8px 12px' }}>Name</th>
                        <th style={{ padding: '8px 12px' }}>Category</th>
                        <th style={{ padding: '8px 12px' }}>Price</th>
                        <th style={{ padding: '8px 12px' }}>Dietary</th>
                        <th style={{ padding: '8px 12px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedItems.map((item, idx) => (
                        <tr
                          key={idx}
                          style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: !item.isValid ? 'rgba(239,68,68,0.1)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                          }}
                        >
                          <td style={{ padding: '8px 12px' }}>
                            {item.isExisting ? (
                              <span style={{ color: '#38bdf8', fontWeight: 700 }}>UPDATE</span>
                            ) : (
                              <span style={{ color: '#4ade80', fontWeight: 700 }}>NEW</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px', color: '#fff', fontWeight: 600 }}>{item.name || '—'}</td>
                          <td style={{ padding: '8px 12px', color: '#cbd5e1' }}>{item.category}</td>
                          <td style={{ padding: '8px 12px', color: '#f97316', fontWeight: 700 }}>₱{item.price.toFixed(2)}</td>
                          <td style={{ padding: '8px 12px', color: '#94a3b8' }}>
                            {item.dietary_tags.length > 0 ? item.dietary_tags.join(', ') : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {item.isValid ? (
                              <span style={{ color: '#4ade80' }}>✓ Ready</span>
                            ) : (
                              <span style={{ color: '#f87171' }}>⚠️ {item.errors.join(', ')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Import Status Reporting */}
            {importStats && (
              <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: 14, marginBottom: 16, color: '#86efac', fontSize: 13, fontWeight: 600 }}>
                🎉 Successfully imported: {importStats.created} created, {importStats.updated} updated{importStats.failed > 0 ? `, ${importStats.failed} failed` : ''}.
              </div>
            )}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 }}>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontWeight: 600, cursor: 'pointer' }}
              >
                Close
              </button>
              {parsedItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleExecuteBatchImport}
                  disabled={isImporting || parsedItems.filter(p => p.isValid).length === 0}
                  style={{
                    padding: '10px 28px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #f97316, #ea580c)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    cursor: isImporting ? 'not-allowed' : 'pointer',
                    opacity: isImporting ? 0.7 : 1,
                  }}
                >
                  {isImporting ? 'Importing Dishes…' : `Confirm & Import (${parsedItems.filter(p => p.isValid).length} Dishes)`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Shared Styling Constants ─────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'rgba(255,255,255,0.7)',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 10,
  padding: '11px 14px',
  color: '#fff',
  fontSize: 14,
  boxSizing: 'border-box',
  outline: 'none',
  fontFamily: 'inherit',
}

const primaryBtnStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #f97316, #ea580c)',
  color: '#fff',
  border: 'none',
  borderRadius: 10,
  padding: '10px 20px',
  fontWeight: 800,
  cursor: 'pointer',
  fontSize: 13,
  boxShadow: '0 4px 12px rgba(249,115,22,0.3)',
}

const secondaryBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: '#cbd5e1',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 10,
  padding: '10px 16px',
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 13,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const kpiCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.035)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16,
  padding: '18px 20px',
  backdropFilter: 'blur(10px)',
}

const modalOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.82)',
  backdropFilter: 'blur(12px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 20,
}

const modalCardStyle: React.CSSProperties = {
  background: 'rgba(15, 18, 30, 0.98)',
  border: '1px solid rgba(249, 115, 22, 0.3)',
  borderRadius: 22,
  padding: 28,
  width: '100%',
  boxShadow: '0 25px 60px rgba(0,0,0,0.7)',
  maxHeight: '90vh',
  overflowY: 'auto',
}
