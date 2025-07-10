document.addEventListener('DOMContentLoaded', function() {
    // Gestion des modaux
    const modal = document.getElementById('blacklistModal');
    const confirmBlacklistBtn = document.getElementById('confirmBlacklist');
    let currentUserId = '';

    // Ouvrir le modal de blacklist
    window.openBlacklistModal = function(userId, username, ip) {
        currentUserId = userId;
        document.getElementById('blacklistUsername').textContent = username;
        document.getElementById('blacklistUserId').textContent = userId;
        document.getElementById('blacklistUserIp').textContent = ip;
        modal.style.display = 'flex';
    };

    // Fermer le modal
    window.closeModal = function() {
        modal.style.display = 'none';
        currentUserId = '';
    };

    // Confirmer le blacklist
    confirmBlacklistBtn.addEventListener('click', async function() {
        try {
            const response = await fetch('/api/blacklist', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    userId: currentUserId,
                    username: document.getElementById('blacklistUsername').textContent,
                    ip: document.getElementById('blacklistUserIp').textContent
                })
            });
            
            if (response.ok) {
                closeModal();
                location.reload();
            } else {
                const error = await response.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    });

    // Supprimer une autorisation
    window.removeAuthorization = async function(userId) {
        if (confirm('Are you sure you want to remove this authorization?')) {
            try {
                const response = await fetch(`/api/verified-users/${userId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    location.reload();
                } else {
                    const error = await response.json();
                    alert('Failed to remove authorization: ' + error.error);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
    };

    // Retirer de la blacklist
    window.removeBlacklist = async function(userId) {
        if (confirm('Are you sure you want to remove this user from blacklist?')) {
            try {
                const response = await fetch(`/api/blacklist/${userId}`, {
                    method: 'DELETE'
                });
                
                if (response.ok) {
                    location.reload();
                } else {
                    const error = await response.json();
                    alert('Failed to remove from blacklist: ' + error.error);
                }
            } catch (error) {
                alert('Error: ' + error.message);
            }
        }
    };

    // Recherche d'utilisateurs
    const userSearch = document.getElementById('userSearch');
    if (userSearch) {
        userSearch.addEventListener('input', function() {
            const term = this.value.toLowerCase();
            const rows = document.querySelectorAll('.user-table tbody tr');
            
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
    }

    // Boutons de rafraîchissement
    document.querySelectorAll('.refresh-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            this.classList.add('refreshing');
            setTimeout(() => {
                location.reload();
            }, 1000);
        });
    });

    // Révéler les IPs au clic
    document.querySelectorAll('.ip-cell').forEach(cell => {
        cell.addEventListener('click', function() {
            const ipValue = this.querySelector('.ip-value');
            ipValue.style.filter = ipValue.style.filter === 'none' ? 'blur(5px)' : 'none';
        });
    });

    // Fermer le modal en cliquant à l'extérieur
    window.addEventListener('click', function(event) {
        if (event.target === modal) {
            closeModal();
        }
    });
});