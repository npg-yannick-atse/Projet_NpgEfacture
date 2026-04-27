const axios = require('axios');

async function testSorting() {
    const baseUrl = 'http://localhost:6003/api/downloaded-invoices';

    try {
        console.log('Testing ASC sorting (by download_date)...');
        const resAsc = await axios.get(`${baseUrl}?sortBy=download_date&sortOrder=ASC`);
        const ascData = resAsc.data.data.slice(0, 5).map(inv => ({
            numero: inv.numero,
            date: inv.date,
            download_date: inv.download_date
        }));
        console.table(ascData);

        console.log('\nTesting DESC sorting (by download_date)...');
        const resDesc = await axios.get(`${baseUrl}?sortBy=download_date&sortOrder=DESC`);
        const descData = resDesc.data.data.slice(0, 5).map(inv => ({
            numero: inv.numero,
            date: inv.date,
            download_date: inv.download_date
        }));
        console.table(descData);
    } catch (error) {
        console.error('Error testing:', error.message);
    }
}

testSorting();
