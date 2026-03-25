// VLSM Calculator Logic

function ipToInt(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

function intToIp(int) {
    return [
        (int >>> 24) & 255,
        (int >>> 16) & 255,
        (int >>> 8) & 255,
        int & 255
    ].join('.');
}

function calculateSubnetMask(prefix) {
    const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
    return intToIp(mask);
}

function calculateWildcard(prefix) {
    const wildcard = ~(0xFFFFFFFF << (32 - prefix)) >>> 0;
    return intToIp(wildcard);
}

function calculateRequiredPrefix(hosts) {
    // Need hosts + 2 (network + broadcast)
    const totalAddresses = hosts + 2;
    const bits = Math.ceil(Math.log2(totalAddresses));
    return 32 - bits;
}

function validateIP(ip) {
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    return parts.every(part => {
        const num = parseInt(part);
        return num >= 0 && num <= 255;
    });
}

function calculateVLSM(networkIP, cidr, subnets) {
    if (!validateIP(networkIP)) {
        return { error: 'Invalid IP address format' };
    }

    if (cidr < 8 || cidr > 30) {
        return { error: 'CIDR must be between 8 and 30' };
    }

    // Sort subnets by host count (descending) and keep track of original order
    const sortedSubnets = subnets
        .map((subnet, index) => ({ ...subnet, originalIndex: index }))
        .sort((a, b) => b.hosts - a.hosts);

    const results = [];
    let currentIP = ipToInt(networkIP);
    const networkSize = Math.pow(2, 32 - cidr);
    const networkEnd = currentIP + networkSize;

    for (const subnet of sortedSubnets) {
        const requiredPrefix = calculateRequiredPrefix(subnet.hosts);
        
        if (requiredPrefix < cidr) {
            return { error: `Subnet "${subnet.name}" requires too many hosts for the given network` };
        }

        const subnetSize = Math.pow(2, 32 - requiredPrefix);
        
        // Align to subnet boundary
        const remainder = currentIP % subnetSize;
        if (remainder !== 0) {
            currentIP += subnetSize - remainder;
        }

        if (currentIP + subnetSize > networkEnd) {
            return { error: 'Not enough address space for all subnets' };
        }

        const networkAddress = intToIp(currentIP);
        const firstUsable = intToIp(currentIP + 1);
        const lastUsable = intToIp(currentIP + subnetSize - 2);
        const broadcast = intToIp(currentIP + subnetSize - 1);
        const subnetMask = calculateSubnetMask(requiredPrefix);
        const wildcard = calculateWildcard(requiredPrefix);
        const usableHosts = subnetSize - 2;

        results.push({
            name: subnet.name,
            requestedHosts: subnet.hosts,
            networkAddress,
            firstUsable,
            lastUsable,
            broadcast,
            subnetMask,
            wildcard,
            prefix: requiredPrefix,
            usableHosts,
            totalAddresses: subnetSize,
            originalIndex: subnet.originalIndex
        });

        currentIP += subnetSize;
    }

    // Keep results sorted by size (descending) - don't sort back to original order
    return { results: results };
}

// UI Logic
document.addEventListener('DOMContentLoaded', () => {
    const applySubnetsBtn = document.getElementById('apply-subnets');
    const addOneSubnetBtn = document.getElementById('add-one-subnet');
    const calculateBtn = document.getElementById('calculate');
    const subnetCountInput = document.getElementById('subnet-count');
    const subnetNamesContainer = document.getElementById('subnet-names-container');
    const hostCountsContainer = document.getElementById('host-counts-container');
    const resultsDiv = document.getElementById('results');

    // Generate initial subnet fields
    generateSubnetFields(2);

    applySubnetsBtn.addEventListener('click', () => {
        const count = parseInt(subnetCountInput.value) || 1;
        generateSubnetFields(count);
    });

    addOneSubnetBtn.addEventListener('click', () => {
        const currentCount = subnetNamesContainer.children.length;
        addSingleSubnetField(currentCount + 1);
    });

    function generateSubnetFields(count) {
        subnetNamesContainer.innerHTML = '';
        hostCountsContainer.innerHTML = '';

        for (let i = 1; i <= count; i++) {
            addSingleSubnetField(i);
        }
    }

    function addSingleSubnetField(index) {
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'subnet-name-input';
        nameInput.placeholder = `Subnet ${index}`;
        nameInput.value = index;
        subnetNamesContainer.appendChild(nameInput);

        const hostInput = document.createElement('input');
        hostInput.type = 'number';
        hostInput.className = 'host-count-input';
        hostInput.placeholder = '0';
        hostInput.value = '0';
        hostInput.min = '1';
        hostCountsContainer.appendChild(hostInput);
    }

    calculateBtn.addEventListener('click', () => {
        const networkIP = document.getElementById('network-ip').value.trim();
        const cidr = parseInt(document.getElementById('cidr').value);

        const subnetNames = Array.from(document.querySelectorAll('.subnet-name-input'));
        const hostCounts = Array.from(document.querySelectorAll('.host-count-input'));

        const subnets = subnetNames.map((nameInput, index) => ({
            name: nameInput.value.trim() || `Subnet ${index + 1}`,
            hosts: parseInt(hostCounts[index].value) || 0
        }));

        if (subnets.some(s => s.hosts <= 0)) {
            resultsDiv.innerHTML = '<div class="error">All subnets must have at least 1 host</div>';
            return;
        }

        const result = calculateVLSM(networkIP, cidr, subnets);

        if (result.error) {
            resultsDiv.innerHTML = `<div class="error">${result.error}</div>`;
            return;
        }

        resultsDiv.innerHTML = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th>Subnet Name</th>
                        <th>Network Address</th>
                        <th>Subnet Mask</th>
                        <th>First Usable</th>
                        <th>Last Usable</th>
                        <th>Broadcast</th>
                        <th>Wildcard</th>
                        <th>Usable Hosts</th>
                    </tr>
                </thead>
                <tbody>
                    ${result.results.map(subnet => `
                        <tr>
                            <td class="subnet-name-cell">${subnet.name}</td>
                            <td>${subnet.networkAddress}/${subnet.prefix}</td>
                            <td>${subnet.subnetMask}</td>
                            <td>${subnet.firstUsable}</td>
                            <td>${subnet.lastUsable}</td>
                            <td>${subnet.broadcast}</td>
                            <td>${subnet.wildcard}</td>
                            <td>${subnet.usableHosts}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        // Generate documentation tables
        generateDocumentationTables(result.results);
    });

    function generateDocumentationTables(subnets) {
        const numUsers = parseInt(document.getElementById('num-users').value) || 0;
        const routersTbody = document.getElementById('routers-tbody');
        const switchesTbody = document.getElementById('switches-tbody');
        const endusersContainer = document.getElementById('endusers-container');

        // Clear existing content
        routersTbody.innerHTML = '';
        switchesTbody.innerHTML = '';
        endusersContainer.innerHTML = '';

        // Generate router entries (one per subnet)
        subnets.forEach((subnet, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Router${index + 1}</td>
                <td>G0/${index}</td>
                <td>${subnet.lastUsable}</td>
                <td>${subnet.subnetMask}</td>
                <td>${subnet.lastUsable}</td>
                <td></td>
                <td></td>
                <td></td>
            `;
            routersTbody.appendChild(row);
        });

        // Generate switch entries (one per subnet)
        subnets.forEach((subnet, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Switch${index + 1}</td>
                <td>F0/1</td>
                <td>${index + 1}</td>
                <td>Yes</td>
                <td>No</td>
                <td>1</td>
                <td></td>
                <td>${subnet.lastUsable}</td>
            `;
            switchesTbody.appendChild(row);
        });

        // Generate end-user entries based on number of users input
        if (numUsers > 0) {
            const usersPerSubnet = Math.ceil(numUsers / subnets.length);
            let globalUserCount = 0;
            let subnetDebugInfo = [];
            
            for (let subnetIndex = 0; subnetIndex < subnets.length && globalUserCount < numUsers; subnetIndex++) {
                const subnet = subnets[subnetIndex];
                const usersInThisSubnet = Math.min(usersPerSubnet, numUsers - globalUserCount);

                // Create a separate table for this subnet
                const subnetTableDiv = document.createElement('div');
                subnetTableDiv.className = 'subnet-enduser-table';
                subnetTableDiv.innerHTML = `
                    <h4>${subnet.name}</h4>
                    <table class="doc-table">
                        <thead>
                            <tr>
                                <th>Device Name</th>
                                <th>IPv4 Address</th>
                                <th>Subnet Mask</th>
                                <th>IPv4 Default Gateway</th>
                                <th>IPv4 DNS Server</th>
                                <th>IPv6 Address</th>
                                <th>IPv6 Default Gateway</th>
                                <th>IPv6 DNS Server</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                `;
                endusersContainer.appendChild(subnetTableDiv);

                const tbody = subnetTableDiv.querySelector('tbody');
                let pcCountInSubnet = 0;

                // Parse the first usable IP
                const firstIP = subnet.firstUsable.split('.').map(Number);
                
                for (let i = 0; i < usersInThisSubnet; i++) {
                    globalUserCount++;
                    pcCountInSubnet++;
                    
                    // Calculate IP address for this user
                    let currentIP = [...firstIP];
                    currentIP[3] += i;
                    
                    // Handle overflow
                    for (let octet = 3; octet > 0; octet--) {
                        if (currentIP[octet] > 255) {
                            currentIP[octet] -= 256;
                            currentIP[octet - 1]++;
                        }
                    }
                    
                    const userIP = currentIP.join('.');
                    
                    // Create device name with subnet name prefix
                    const deviceName = `${subnet.name}PC${i + 1}`;
                    
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${deviceName}</td>
                        <td>${userIP}</td>
                        <td>${subnet.subnetMask}</td>
                        <td>${subnet.lastUsable}</td>
                        <td>${ipv4DNS}</td>
                        <td></td>
                        <td></td>
                        <td>${ipv6DNS}</td>
                    `;
                    tbody.appendChild(row);
                }
                
                // Store debug info for this subnet
                subnetDebugInfo.push({
                    name: subnet.name,
                    pcCount: pcCountInSubnet
                });
            }
            
            // Display debug information
            displayDebugInfo(globalUserCount, subnets.length, subnetDebugInfo);
        }

        // Show documentation section
        document.getElementById('documentation-section').style.display = 'block';
    }
    
    function displayDebugInfo(totalPCs, totalSubnets, subnetInfo) {
        const debugDiv = document.getElementById('debug-info');
        
        let subnetDetails = subnetInfo.map(info => 
            `<div class="subnet-debug"><strong>${info.name}:</strong> ${info.pcCount} PCs</div>`
        ).join('');
        
        debugDiv.innerHTML = `
            <h4>📊 Debug Information</h4>
            <div class="debug-stats">
                <div class="debug-stat">
                    <div class="debug-stat-label">Total PCs Generated</div>
                    <div class="debug-stat-value">${totalPCs}</div>
                </div>
                <div class="debug-stat">
                    <div class="debug-stat-label">Total Subnets</div>
                    <div class="debug-stat-value">${totalSubnets}</div>
                </div>
                <div class="debug-stat">
                    <div class="debug-stat-label">Avg PCs per Subnet</div>
                    <div class="debug-stat-value">${Math.round(totalPCs / totalSubnets)}</div>
                </div>
            </div>
            ${subnetDetails}
        `;
    }

    // Export to Excel functionality
    document.getElementById('export-excel').addEventListener('click', () => {
        const wb = XLSX.utils.book_new();

        // Function to add borders and styling to worksheet
        function styleWorksheet(ws, rowCount, colCount) {
            const range = XLSX.utils.decode_range(ws['!ref']);
            
            // Auto-width columns
            const colWidths = [];
            for (let C = range.s.c; C <= range.e.c; ++C) {
                let maxWidth = 10;
                for (let R = range.s.r; R <= range.e.r; ++R) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    const cell = ws[cellAddress];
                    if (cell && cell.v) {
                        const cellLength = cell.v.toString().length;
                        maxWidth = Math.max(maxWidth, cellLength + 2);
                    }
                }
                colWidths.push({ wch: Math.min(maxWidth, 50) });
            }
            ws['!cols'] = colWidths;

            // Add borders to all cells
            for (let R = range.s.r; R <= range.e.r; ++R) {
                for (let C = range.s.c; C <= range.e.c; ++C) {
                    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                    if (!ws[cellAddress]) {
                        ws[cellAddress] = { t: 's', v: '' };
                    }
                    
                    if (!ws[cellAddress].s) {
                        ws[cellAddress].s = {};
                    }
                    
                    // Add borders
                    ws[cellAddress].s.border = {
                        top: { style: 'thin', color: { rgb: '000000' } },
                        bottom: { style: 'thin', color: { rgb: '000000' } },
                        left: { style: 'thin', color: { rgb: '000000' } },
                        right: { style: 'thin', color: { rgb: '000000' } }
                    };
                    
                    // Style header row
                    if (R === 0) {
                        ws[cellAddress].s.fill = {
                            fgColor: { rgb: '6366F1' }
                        };
                        ws[cellAddress].s.font = {
                            bold: true,
                            color: { rgb: 'FFFFFF' }
                        };
                        ws[cellAddress].s.alignment = {
                            horizontal: 'center',
                            vertical: 'center'
                        };
                    }
                }
            }
        }

        // Export Routers table
        const routersTable = document.getElementById('routers-table');
        const routersWS = XLSX.utils.table_to_sheet(routersTable);
        styleWorksheet(routersWS);
        XLSX.utils.book_append_sheet(wb, routersWS, 'Routers');

        // Export Switches table
        const switchesTable = document.getElementById('switches-table');
        const switchesWS = XLSX.utils.table_to_sheet(switchesTable);
        styleWorksheet(switchesWS);
        XLSX.utils.book_append_sheet(wb, switchesWS, 'Switches');

        // Export each subnet's end-users table as a separate sheet
        const endusersContainer = document.getElementById('endusers-container');
        const subnetTables = endusersContainer.querySelectorAll('.subnet-enduser-table');
        
        subnetTables.forEach((subnetDiv, index) => {
            const table = subnetDiv.querySelector('table');
            const subnetName = subnetDiv.querySelector('h4').textContent;
            const ws = XLSX.utils.table_to_sheet(table);
            styleWorksheet(ws);
            XLSX.utils.book_append_sheet(wb, ws, `${subnetName}-Users`);
        });

        // Save file
        XLSX.writeFile(wb, 'Cisco_Packet_Tracer_Documentation.xlsx');
    });
});


// DNS Configuration
let ipv4DNS = '';
let ipv6DNS = '';
let dnsChanged = false;

document.getElementById('set-ipv4-dns').addEventListener('click', () => {
    const value = document.getElementById('ipv4-dns').value.trim();
    if (value) {
        ipv4DNS = value;
        dnsChanged = true;
        
        // Show success indicator
        const btn = document.getElementById('set-ipv4-dns');
        btn.textContent = '✓ DNS Set';
        btn.style.background = '#10b981';
        
        // Show regenerate message
        showRegenerateMessage();
        
        setTimeout(() => {
            btn.textContent = 'Set DNS Server';
            btn.style.background = '';
        }, 2000);
    } else {
        alert('Please enter an IPv4 DNS server address.');
    }
});

document.getElementById('set-ipv6-dns').addEventListener('click', () => {
    const value = document.getElementById('ipv6-dns').value.trim();
    if (value) {
        ipv6DNS = value;
        dnsChanged = true;
        
        // Show success indicator
        const btn = document.getElementById('set-ipv6-dns');
        btn.textContent = '✓ IPv6 Set';
        btn.style.background = '#10b981';
        
        // Show regenerate message
        showRegenerateMessage();
        
        setTimeout(() => {
            btn.textContent = 'Set IPv6';
            btn.style.background = '';
        }, 2000);
    } else {
        alert('Please enter an IPv6 DNS server address.');
    }
});

function showRegenerateMessage() {
    let msgDiv = document.getElementById('regenerate-message');
    if (!msgDiv) {
        msgDiv = document.createElement('div');
        msgDiv.id = 'regenerate-message';
        msgDiv.className = 'regenerate-message';
        msgDiv.innerHTML = '⚠️ Click "Generate Subnets" again to apply DNS changes';
        document.querySelector('.side-panel').appendChild(msgDiv);
    }
    msgDiv.style.display = 'block';
}

// Hide regenerate message when generate button is clicked
const originalCalculateHandler = document.getElementById('calculate');
originalCalculateHandler.addEventListener('click', () => {
    const msgDiv = document.getElementById('regenerate-message');
    if (msgDiv && dnsChanged) {
        msgDiv.style.display = 'none';
        dnsChanged = false;
    }
});
