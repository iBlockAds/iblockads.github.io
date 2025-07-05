function copyDNS() {
		var copyText = document.getElementById("dnsIP");
		copyText.select();
		copyText.setSelectionRange(0, 99999); 
		document.execCommand("copy");
		document.getElementById("messageDNS").style.display = "block";
	}
	
function copyLink() {
		var copyText = document.getElementById("Link");
		copyText.select();
		copyText.setSelectionRange(0, 99999); 
		document.execCommand("copy");
		document.getElementById("messageLink").style.display = "block";
	}