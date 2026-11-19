// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

contract CertificateRegistry {
    struct Certificate {
        string studentName;
        string studentId;
        string diplomaTitle;
        string issueDate;
        string grade;
        address recipient;
        bool revoked;
    }

    address public owner;
    mapping(address => bool) public admins;

    Certificate[] private certificates;
    mapping(string => bool) private studentIdExists;
    mapping(string => uint256) private studentIdToCertId;

    event CertificateMinted(
        uint256 indexed certId,
        string studentId,
        address indexed recipient,
        string diplomaTitle
    );

    event CertificateRevoked(uint256 indexed certId, string studentId);
    event AdminUpdated(address indexed account, bool allowed);

    modifier onlyAdmin() {
        require(
            msg.sender == owner || admins[msg.sender],
            "Acces refuse : reserve a l'admin"
        );
        _;
    }

    constructor() {
        owner = msg.sender;
        admins[msg.sender] = true;
    }

    function setAdmin(address account, bool allowed) external {
        require(msg.sender == owner, "Seul le owner peut gerer les admins");
        require(account != address(0), "Adresse invalide");
        admins[account] = allowed;
        emit AdminUpdated(account, allowed);
    }

    function mintCertificate(
        address to,
        string calldata studentName,
        string calldata studentId,
        string calldata diplomaTitle,
        string calldata issueDate,
        string calldata grade
    ) external onlyAdmin returns (uint256 certId) {
        require(bytes(studentId).length > 0, "studentId obligatoire");
        require(!studentIdExists[studentId], "Ce studentId existe deja");

        Certificate storage cert = certificates.push();
        cert.studentName = studentName;
        cert.studentId = studentId;
        cert.diplomaTitle = diplomaTitle;
        cert.issueDate = issueDate;
        cert.grade = grade;
        cert.recipient = to;
        cert.revoked = false;

        certId = certificates.length - 1;
        studentIdExists[studentId] = true;
        studentIdToCertId[studentId] = certId;

        emit CertificateMinted(certId, studentId, to, diplomaTitle);
    }

    function batchMint(
        address[] calldata recipients,
        string[] calldata studentNames,
        string[] calldata studentIds,
        string[] calldata diplomaTitles,
        string[] calldata issueDates,
        string[] calldata grades
    ) external onlyAdmin {
        uint256 count = studentIds.length;
        require(count > 0, "Lot vide");
        require(
            recipients.length == count &&
                studentNames.length == count &&
                diplomaTitles.length == count &&
                issueDates.length == count &&
                grades.length == count,
            "Longueurs des tableaux incompatibles"
        );

        for (uint256 i = 0; i < count; i++) {
            string calldata sid = studentIds[i];
            require(bytes(sid).length > 0, "studentId obligatoire");
            require(!studentIdExists[sid], "Doublon de studentId dans le lot");

            Certificate storage cert = certificates.push();
            cert.studentName = studentNames[i];
            cert.studentId = sid;
            cert.diplomaTitle = diplomaTitles[i];
            cert.issueDate = issueDates[i];
            cert.grade = grades[i];
            cert.recipient = recipients[i];
            cert.revoked = false;

            uint256 certId = certificates.length - 1;
            studentIdExists[sid] = true;
            studentIdToCertId[sid] = certId;

            emit CertificateMinted(certId, sid, recipients[i], diplomaTitles[i]);
        }
    }

    function getCertificate(uint256 certId)
        external
        view
        returns (Certificate memory)
    {
        require(certId < certificates.length, "Certificat inexistant");
        return certificates[certId];
    }

    function getCertificateByStudentId(string calldata studentId)
        external
        view
        returns (uint256 certId, Certificate memory cert)
    {
        require(studentIdExists[studentId], "Aucun certificat pour ce studentId");
        certId = studentIdToCertId[studentId];
        cert = certificates[certId];
    }

    function totalCertificates() external view returns (uint256) {
        return certificates.length;
    }

    function revoke(uint256 certId) external onlyAdmin {
        require(certId < certificates.length, "Certificat inexistant");
        Certificate storage cert = certificates[certId];
        require(!cert.revoked, "Certificat deja revoque");

        cert.revoked = true;
        emit CertificateRevoked(certId, cert.studentId);
    }
}