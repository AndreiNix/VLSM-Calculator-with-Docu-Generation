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

    // Debug autofill button
    document.getElementById('debug-autofill').addEventListener('click', () => {
        // Set subnet count to 6
        subnetCountInput.value = 6;
        
        // Generate 6 subnet fields
        generateSubnetFields(6);
        
        // Fill in subnet names and host counts
        const testData = [
            { name: 'isyn', hosts: 100 },
            { name: 'mba', hosts: 100 },
            { name: 'rbv', hosts: 100 },
            { name: 'coop', hosts: 100 },
            { name: 'hr', hosts: 100 },
            { name: 'server', hosts: 16 }
        ];
        
        const nameInputs = document.querySelectorAll('.subnet-name-input');
        const hostInputs = document.querySelectorAll('.host-count-input');
        
        testData.forEach((data, index) => {
            if (nameInputs[index]) nameInputs[index].value = data.name;
            if (hostInputs[index]) hostInputs[index].value = data.hosts;
        });
        
        // Show success message
        const btn = document.getElementById('debug-autofill');
        const originalText = btn.textContent;
        btn.textContent = '✓ Autofilled!';
        btn.style.background = '#10b981';
        
        setTimeout(() => {
            btn.textContent = originalText;
            btn.style.background = '';
        }, 2000);
    });

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
        const routersTbody = document.getElementById('routers-tbody');
        const switchesTbody = document.getElementById('switches-tbody');
        const endusersContainer = document.getElementById('endusers-container');

        // Clear existing content
        routersTbody.innerHTML = '';
        switchesTbody.innerHTML = '';
        endusersContainer.innerHTML = '';

            // Generate router entries based on interface groups
        const interfaceGroups = getInterfaceGroups();
        const startingVlan = parseInt(document.getElementById('starting-vlan').value) || 10;
        const vlanIncrement = parseInt(document.getElementById('vlan-increment').value) || 10;
        
        let subnetIndex = 0;
        let currentVlanId = startingVlan;
        
        // Store VLAN to IPv6 mapping for end-users
        const vlanToIPv6Map = {};
        
        interfaceGroups.forEach((group, groupIndex) => {
            let vlansOnThisInterface = 0;
            
            // Add base interface row (e.g., G0/0)
            if (subnetIndex < subnets.length) {
                const subnet = subnets[subnetIndex];
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td></td>
                    <td></td>
                    <td>${group.interface}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
                `;
                routersTbody.appendChild(row);
            }
            
            // Add subinterfaces for this gigabit interface
            while (vlansOnThisInterface < group.vlanCount && subnetIndex < subnets.length) {
                const subnet = subnets[subnetIndex];
                const interfaceName = `${group.interface}.${currentVlanId}`;
                
                // Generate IPv6 addresses if prefix is set
                let ipv6Addr = '';
                let ipv6Gateway = '';
                if (ipv6Prefix) {
                    ipv6Addr = generateIPv6Address(currentVlanId, ipv6Prefix, ipv6Format);
                    ipv6Gateway = generateIPv6Gateway(currentVlanId, ipv6Prefix, ipv6Format);
                    
                    // Store mapping for end-users (subnet index -> IPv6 address)
                    vlanToIPv6Map[subnetIndex] = {
                        vlanId: currentVlanId,
                        ipv6Address: ipv6Addr,
                        ipv6Gateway: ipv6Addr // Use the router's IPv6 address as gateway for users
                    };
                }
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${currentVlanId}</td>
                    <td>${subnet.name}</td>
                    <td>${interfaceName}</td>
                    <td>${subnet.lastUsable}</td>
                    <td>${subnet.subnetMask}</td>
                    <td>${subnet.lastUsable}</td>
                    <td>${ipv6Addr}</td>
                    <td>${ipv6Gateway}</td>
                `;
                routersTbody.appendChild(row);
                
                currentVlanId += vlanIncrement;
                vlansOnThisInterface++;
                subnetIndex++;
            }
        });

        // Generate switch entries (one per subnet)
        subnets.forEach((subnet, index) => {
            const vlanId = index + 10; // Start VLAN IDs from 10
            
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>Switch${index + 1}</td>
                <td>F0/1</td>
                <td>${vlanId}</td>
                <td>Yes</td>
                <td>No</td>
                <td>1</td>
                <td></td>
                <td>${subnet.lastUsable}</td>
            `;
            switchesTbody.appendChild(row);
        });

        // Generate end-user entries based on host count per subnet
        const tabsContainer = document.createElement('div');
        tabsContainer.className = 'subnet-tabs';
        endusersContainer.appendChild(tabsContainer);
        
        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'subnet-tabs-content';
        endusersContainer.appendChild(contentContainer);
        
        let totalPCsGenerated = 0;
        let subnetDebugInfo = [];
        
        subnets.forEach((subnet, subnetIndex) => {
            const usersInThisSubnet = subnet.requestedHosts; // Use the requested hosts as number of PCs

            // Create tab button
            const tabButton = document.createElement('button');
            tabButton.className = 'subnet-tab' + (subnetIndex === 0 ? ' active' : '');
            tabButton.textContent = subnet.name;
            tabButton.dataset.subnetIndex = subnetIndex;
            tabsContainer.appendChild(tabButton);

            // Create a separate table for this subnet
            const subnetTableDiv = document.createElement('div');
            subnetTableDiv.className = 'subnet-tab-content' + (subnetIndex === 0 ? ' active' : '');
            subnetTableDiv.dataset.subnetIndex = subnetIndex;
            subnetTableDiv.innerHTML = `
                <div class="subnet-enduser-table">
                    <h4>${subnet.name} - ${usersInThisSubnet} PCs</h4>
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
                </div>
            `;
            contentContainer.appendChild(subnetTableDiv);

            const tbody = subnetTableDiv.querySelector('tbody');

            // Parse the first usable IP
            const firstIP = subnet.firstUsable.split('.').map(Number);
            
            for (let i = 0; i < usersInThisSubnet; i++) {
                totalPCsGenerated++;
                
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
                
                // Get IPv6 info for this subnet
                const ipv6Info = vlanToIPv6Map[subnetIndex] || {};
                const userIPv6Gateway = ipv6Info.ipv6Gateway || '';
                
                // Generate user IPv6 address if prefix is configured
                let userIPv6Address = '';
                if (ipv6Prefix && ipv6Info.vlanId) {
                    userIPv6Address = generateUserIPv6Address(ipv6Info.vlanId, i, ipv6Prefix, ipv6Format);
                }
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${deviceName}</td>
                    <td>${userIP}</td>
                    <td>${subnet.subnetMask}</td>
                    <td>${subnet.lastUsable}</td>
                    <td>${ipv4DNS}</td>
                    <td>${userIPv6Address}</td>
                    <td>${userIPv6Gateway}</td>
                    <td>${ipv6DNS}</td>
                `;
                tbody.appendChild(row);
            }
            
            // Store debug info for this subnet
            subnetDebugInfo.push({
                name: subnet.name,
                pcCount: usersInThisSubnet
            });
        });
        
        // Add tab click handlers
        const tabButtons = tabsContainer.querySelectorAll('.subnet-tab');
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetIndex = button.dataset.subnetIndex;
                
                // Remove active class from all tabs and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                contentContainer.querySelectorAll('.subnet-tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                // Add active class to clicked tab and corresponding content
                button.classList.add('active');
                contentContainer.querySelector(`[data-subnet-index="${targetIndex}"]`).classList.add('active');
            });
        });
        
        // Display debug information
        displayDebugInfo(totalPCsGenerated, subnets.length, subnetDebugInfo);

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
            const subnetName = subnetDiv.querySelector('h4').textContent.split(' - ')[0]; // Remove PC count from name
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
let ipv6Prefix = '';
let ipv6Format = 'vlan-pattern';
let ipv6Addresses = {};
let dnsChanged = false;
let settingsConfigured = false;

// Function to generate IPv6 address based on VLAN ID
function generateIPv6Address(vlanId, prefix, format) {
    // Remove any trailing colons or slashes from prefix
    prefix = prefix.replace(/[:\/]+$/, '');
    
    if (format === 'vlan-pattern') {
        // Format: FD00:10:10:10::1/64 (VLAN ID in decimal, repeated in pattern)
        return `${prefix}:${vlanId}:${vlanId}:${vlanId}::1/64`;
    } else {
        // Format: FD00::10:1/64 (Sequential)
        return `${prefix}::${vlanId}:1/64`;
    }
}

// Function to generate IPv6 gateway address
function generateIPv6Gateway(vlanId, prefix, format) {
    prefix = prefix.replace(/[:\/]+$/, '');
    
    if (format === 'vlan-pattern') {
        // Gateway format: FD00:10:10:10::/64 (ends with :: not ::1)
        return `${prefix}:${vlanId}:${vlanId}:${vlanId}::/64`;
    } else {
        // Gateway format: FD00::10:/64 (Sequential)
        return `${prefix}::${vlanId}:/64`;
    }
}

// Function to generate IPv6 address for end-users (starts from ::2)
function generateUserIPv6Address(vlanId, userIndex, prefix, format) {
    prefix = prefix.replace(/[:\/]+$/, '');
    const hostNumber = userIndex + 2; // Start from ::2 (::1 is the router)
    
    if (format === 'vlan-pattern') {
        // Format: FD00:10:10:10::2/64, FD00:10:10:10::3/64, etc.
        return `${prefix}:${vlanId}:${vlanId}:${vlanId}::${hostNumber}/64`;
    } else {
        // Format: FD00::10:2/64, FD00::10:3/64, etc.
        return `${prefix}::${vlanId}:${hostNumber}/64`;
    }
}

// Interface Groups Management
let interfaceGroups = [];

document.addEventListener('DOMContentLoaded', function() {
    // Add initial interface group
    addInterfaceGroup();
    
    document.getElementById('add-interface-group').addEventListener('click', addInterfaceGroup);
    
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
        });
    });
});

function addInterfaceGroup() {
    const container = document.getElementById('interface-groups-container');
    const groupIndex = interfaceGroups.length;
    
    const groupDiv = document.createElement('div');
    groupDiv.className = 'interface-group';
    groupDiv.dataset.index = groupIndex;
    groupDiv.innerHTML = `
        <div class="interface-group-header">
            <label>Gigabit Interface:</label>
            <input type="text" class="interface-name" placeholder="e.g., G0/0" value="G0/${groupIndex}" />
            <button class="btn-remove-interface" onclick="removeInterfaceGroup(${groupIndex})">×</button>
        </div>
        <div class="vlan-count-wrapper">
            <label>Number of VLANs on this interface:</label>
            <input type="number" class="vlan-count" placeholder="VLANs" min="1" value="5" />
        </div>
    `;
    
    container.appendChild(groupDiv);
    interfaceGroups.push({ interface: `G0/${groupIndex}`, vlanCount: 5 });
}

function removeInterfaceGroup(index) {
    const groupDiv = document.querySelector(`[data-index="${index}"]`);
    if (groupDiv) {
        groupDiv.remove();
        interfaceGroups[index] = null; // Mark as removed
    }
}

function getInterfaceGroups() {
    const groups = [];
    const groupDivs = document.querySelectorAll('.interface-group');
    
    groupDivs.forEach(div => {
        const interfaceName = div.querySelector('.interface-name').value.trim();
        const vlanCount = parseInt(div.querySelector('.vlan-count').value) || 1;
        
        if (interfaceName) {
            groups.push({ 
                interface: interfaceName, 
                vlanCount: vlanCount
            });
        }
    });
    
    return groups;
}

document.getElementById('set-ipv4-dns').addEventListener('click', () => {
    const value = document.getElementById('ipv4-dns').value.trim();
    if (value) {
        ipv4DNS = value;
        dnsChanged = true;
        settingsConfigured = true;
        
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
        settingsConfigured = true;
        
        // Show success indicator
        const btn = document.getElementById('set-ipv6-dns');
        btn.textContent = '✓ IPv6 DNS Set';
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

document.getElementById('generate-ipv6').addEventListener('click', () => {
    const prefix = document.getElementById('ipv6-prefix').value.trim();
    const format = document.getElementById('ipv6-format').value;
    
    if (prefix) {
        ipv6Prefix = prefix;
        ipv6Format = format;
        ipv6Addresses = {}; // Reset addresses
        dnsChanged = true;
        settingsConfigured = true;
        
        // Show success indicator
        const btn = document.getElementById('generate-ipv6');
        btn.textContent = '✓ IPv6 Generated';
        btn.style.background = '#10b981';
        
        // Show regenerate message
        showRegenerateMessage();
        
        setTimeout(() => {
            btn.textContent = 'Generate IPv6 Addresses';
            btn.style.background = '';
        }, 2000);
    } else {
        alert('Please enter an IPv6 prefix (e.g., FD00 or 2001:DB8).');
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
