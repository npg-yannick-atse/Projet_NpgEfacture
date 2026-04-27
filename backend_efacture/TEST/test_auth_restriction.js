const axios = require('axios');

async function testAuthRestriction() {
    const loginUrl = 'http://localhost:6003/api/auth/login';

    // NOTE: This test assumes the LDAP server is reachable or the local fallback is triggered.
    // In a real environment, we'd mock the database check or have a test database.

    try {
        console.log('Testing login with potentially unauthorized user...');
        // We use a username/password that would trigger the LDAP fallback or actual LDAP
        const response = await axios.post(loginUrl, {
            username: 'abbas.assane',
            password: 'somepassword'
        });

        console.log('Response Status:', response.status);
        console.log('Response Data:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Caught expected error or actual error:');
            console.log('Status:', error.response.status);
            console.log('Data:', error.response.data);

            if (error.response.status === 403) {
                console.log('SUCCESS: Access was correctly denied (403 Forbidden).');
            } else {
                console.log('Received different status:', error.response.status);
            }
        } else {
            console.error('Connection error:', error.message);
        }
    }
}

testAuthRestriction();
