import axios from 'axios'

async function test() {
  try {
    const payload = {
        source_warehouse_id: 1,
        destination_warehouse_id: 2,
        items: [{ product_id: 53, quantity: 1 }],
        notes: 'Test script'
    }
    
    const res = await axios.post('http://localhost:4003/api/transfers', payload)
    
    console.log('Success:', res.data)
  } catch (err) {
    console.error('Error:', err.response?.data || err.message)
    if (err.response?.status === 401) console.log('Login failed')
  }
}

test()
