import { supabase } from './supabaseClient.js';

export async function list() {
  const { data, error } = await supabase
    .from('departments')
    .select('*, users:profiles!department_id(count)')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getById(id) {
  const { data, error } = await supabase
    .from('departments')
    .select('*, users:profiles!department_id(count)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function create({ name, code }) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ name, code })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function update(id, fields) {
  const { data, error } = await supabase
    .from('departments')
    .update(fields)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}
