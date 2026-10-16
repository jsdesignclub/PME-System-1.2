import { supabase } from './supabaseClient.js';

export async function list(filters = {}, paging = {}) {
  const limit = paging.limit || 25;
  const offset = paging.offset || 0;
  let query = supabase
    .from('audit_logs')
    .select(`
      id,
      action,
      entity_type,
      entity_id,
      created_at,
      user:profiles!user_id(nic_no,full_name,email,role,department_id)
    `, { count: 'exact' });

  if (filters.user_id) query = query.eq('user_id', filters.user_id);
  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type);
  if (filters.entity_id) query = query.eq('entity_id', filters.entity_id);
  if (filters.action) query = query.eq('action', filters.action);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error, count } = await query.range(offset, offset + limit - 1).order('created_at', { ascending: false });
  if (error) throw error;
  return { rows: data || [], total: count };
}

export async function getById(id) {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      *,
      user:profiles!user_id(nic_no,full_name,email,role,department_id)
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}
